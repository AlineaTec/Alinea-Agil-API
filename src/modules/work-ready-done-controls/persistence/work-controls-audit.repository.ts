export type WorkControlsAuditEventName =
  | "project_profile_upserted"
  | "workspace_template_upserted"
  | "template_applied_to_project"
  | "override_token_issued"
  | "override_token_consumed"
  | "transition_blocked"

/** IDs y códigos; sin copiar título de ítem (OQ-17) */
export type WorkControlsAuditDetails = {
  workItemPublicId?: string
  eventCode?: string
  overrideTokenPublicId?: string
  failedRuleIds?: string[]
  reasonSnippet?: string
}

export type WorkControlsAuditAppendInput = {
  workspacePublicId: string
  projectPublicId: string | null
  event: WorkControlsAuditEventName
  actorUserPublicId: string
  occurredAt: Date
  details: WorkControlsAuditDetails
}

export interface WorkControlsAuditRepository {
  append(input: WorkControlsAuditAppendInput): Promise<void>
}
