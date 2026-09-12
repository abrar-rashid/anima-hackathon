import type { SiteId, StaffIdentity } from '@/domain/types'

export interface ResourceVersion {
  id: string
  version: number
}

export interface SubmissionReceipt {
  resourceId: string
  version: number
  simulatorTime: number
  activity: { actorKind: string; actorName: string; action: string } | null
  httpStatus: number
}

export interface ExecuteApprovedActionInput {
  site: SiteId
  actionName: string
  payload: unknown
  staffIdentity: StaffIdentity
  expectedSourceVersions: ResourceVersion[]
  idempotencyKey: string
}

export interface AnimaWritePort {
  executeApprovedAction(input: ExecuteApprovedActionInput): Promise<SubmissionReceipt>
}
