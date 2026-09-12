import { describe, expect, it } from 'vitest'
import { hashProposal } from '@/services/proposal-hash'

const proposal = {
  transfer: { toTeam: 'gp', mode: 'ACCOUNTABLE_TEAM' },
  deadlines: { ackDeadlineAt: 1789286400000, policySource: 'protocol:v3' },
  actions: [{ kind: 'create_task', supported: true }],
}

describe('proposal-hash', () => {
  it('returns a stable FNV-1a hash prefixed with p', () => {
    const hash = hashProposal(proposal)
    expect(hash).toMatch(/^p[0-9a-f]+$/)
    expect(hashProposal(proposal)).toBe(hash)
  })

  it('canonicalises key order so client and server cannot disagree', () => {
    const shuffled = {
      actions: [{ supported: true, kind: 'create_task' }],
      deadlines: { policySource: 'protocol:v3', ackDeadlineAt: 1789286400000 },
      transfer: { mode: 'ACCOUNTABLE_TEAM', toTeam: 'gp' },
    }
    expect(hashProposal(shuffled)).toBe(hashProposal(proposal))
  })

  it('changes when the approved proposal changes', () => {
    expect(hashProposal({ ...proposal, transfer: { toTeam: 'hospital', mode: 'ACCOUNTABLE_TEAM' } })).not.toBe(
      hashProposal(proposal),
    )
  })
})
