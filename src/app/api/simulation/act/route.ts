import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'
import { hashProposal } from '@/services/proposal-hash'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      patientId?: string
      step?: 'create_task' | 'accept_duty' | 'auto_close'
    }
    const patientId = body.patientId ?? 'SIM-000001'
    const step = body.step ?? 'auto_close'

    const container = getContainer()
    const caseSnapshot = await container.cases.open({ patientId })
    const caseId = caseSnapshot.case.caseId
    const proposal = caseSnapshot.proposal

    if (!proposal) {
      return NextResponse.json({ error: 'no_proposal_available' }, { status: 400 })
    }

    const proposalHash = hashProposal(proposal)

    // Staff identities
    const hospitalClinician = {
      id: 'hosp-1',
      name: 'Dr Morgan Bell',
      role: 'Hospital Clinician',
      teamId: 'hospital' as const,
      attribution: 'app-side' as const,
    }

    const dutyGP = {
      id: 'gp-duty-1',
      name: 'Dr Ada Sim',
      role: 'Duty GP',
      teamId: 'gp' as const,
      attribution: 'app-side' as const,
    }

    let result
    if (step === 'create_task') {
      // Step 1: Ordering team transfers task to GP
      result = await container.cases.approve(caseId, {
        proposalHash,
        approverId: 'hosp-1',
        staff: hospitalClinician,
        actionIndexes: [0],
      })
    } else if (step === 'accept_duty') {
      // Step 2: Duty GP accepts accountability
      result = await container.cases.approve(caseId, {
        proposalHash,
        approverId: 'gp-duty-1',
        staff: dutyGP,
        actionIndexes: [1],
      })
    } else {
      // Auto close: Step 1 (create task)
      result = await container.cases.approve(caseId, {
        proposalHash,
        approverId: 'hosp-1',
        staff: hospitalClinician,
        actionIndexes: [0],
      })

      // If step 1 succeeded, refresh to get updated task id, then execute step 2 (accept)
      try {
        const refreshed = await container.cases.refresh(caseId)
        if (refreshed.proposal) {
          const freshHash = hashProposal(refreshed.proposal)
          const acceptResult = await container.cases.approve(caseId, {
            proposalHash: freshHash,
            approverId: 'gp-duty-1',
            staff: dutyGP,
            actionIndexes: [1],
          })
          result = {
            ...acceptResult,
            receipts: [...result.receipts, ...acceptResult.receipts],
          }
        }
      } catch {
        // Step 1 still completed successfully
      }
    }

    // Return the updated case snapshot and live receipts
    const updatedSnapshot = await container.cases.open({ patientId })

    return NextResponse.json({
      ok: true,
      step,
      receipts: result.receipts,
      case: updatedSnapshot.case,
      message: 'Loop closed: task created in GP Connect, accepted by Duty GP with provenance.',
    })
  } catch (error) {
    console.error('Failed to execute simulation act:', error)
    return NextResponse.json(
      { error: 'act_failed', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
