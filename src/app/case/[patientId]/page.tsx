import { CaseWorkspace, DEFAULT_STAFF_ROSTER, type CaseWorkspaceSnapshot } from '@/components/CaseWorkspace'
import styles from '@/components/case-workspace.module.css'

export const dynamic = 'force-dynamic'

const SYNTHETIC_PATIENT_NAMES: Record<string, string> = {
  'SIM-000001': 'Amira Khan',
  'SIM-000006': 'Eleanor Chen',
}

function appBaseUrl(): string {
  return process.env.CARE_COVENANT_INTERNAL_URL ?? 'http://127.0.0.1:3000'
}

function parseStaffRoster(raw: string | undefined): CaseWorkspaceSnapshot['staffRoster'] {
  if (!raw?.trim()) return DEFAULT_STAFF_ROSTER
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_STAFF_ROSTER
    return parsed.map((entry: { id?: string; name?: string; role?: string; teamId?: string }) => ({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? ''),
      role: String(entry.role ?? ''),
      teamId: String(entry.teamId ?? ''),
      attribution: 'app-side' as const,
    })).filter((entry) => entry.id && entry.name)
  } catch {
    return DEFAULT_STAFF_ROSTER
  }
}

export function CaseLoadError({ patientId, message }: { patientId: string; message: string }) {
  return (
    <main className={styles.errorPanel} role="alert">
      <h1>Case could not be loaded</h1>
      <p>{message}</p>
      <p>
        Patient <span>{patientId}</span>. Ownership and source records are unknown until the case API
        responds. No write was sent.
      </p>
    </main>
  )
}

export default async function CasePage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const patientName = SYNTHETIC_PATIENT_NAMES[patientId] ?? 'Synthetic patient'

  try {
    const response = await fetch(`${appBaseUrl()}/api/case/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patientId }),
      cache: 'no-store',
    })
    if (!response.ok) {
      return (
        <CaseLoadError
          patientId={patientId}
          message={`The case could not be loaded from the server (HTTP ${response.status}). No write was sent.`}
        />
      )
    }
    const snapshot = (await response.json()) as CaseWorkspaceSnapshot
    if (!snapshot.staffRoster?.length) {
      snapshot.staffRoster = parseStaffRoster(process.env.COVENANT_STAFF_ROSTER)
    }
    return <CaseWorkspace snapshot={snapshot} patientName={patientName} />
  } catch {
    return (
      <CaseLoadError
        patientId={patientId}
        message="The case could not be loaded from the server. No write was sent."
      />
    )
  }
}
