export type WorkControlsAuditEventName =
  | "project_profile_upserted"
  | "workspace_template_upserted"
  | "template_applied_to_project"
  | "override_token_issued"
  | "override_token_consumed"
  | "transition_blocked"

export interface WorkControlsAuditEventDocProps {
  auditEventPublicId: string
  workspacePublicId: string
  projectPublicId: string | null
  event: WorkControlsAuditEventName
  actorUserPublicId: string
  occurredAt: Date
  /** IDs y códigos; sin copiar título de ítem (OQ-17) */
  details: {
    workItemPublicId?: string
    eventCode?: string
    overrideTokenPublicId?: string
    failedRuleIds?: string[]
    reasonSnippet?: string
  }
}
