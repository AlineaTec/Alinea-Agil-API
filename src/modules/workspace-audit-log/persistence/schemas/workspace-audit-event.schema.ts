import type { WorkspaceAuditLogDailyAlignmentAction, WorkspaceAuditLogGuidedRefinementAction, WorkspaceAuditLogGuidedReviewAction, WorkspaceAuditLogGuidedRetrospectiveAction, WorkspaceAuditLogGuidedSprintPlanningAction, WorkspaceAuditLogKanbanBacklogAction, WorkspaceAuditLogKanbanBoardAction, WorkspaceAuditLogKanbanWipAction, WorkspaceAuditLogScrumBacklogAction, WorkspaceAuditLogSprintBoardAction, WorkspaceAuditLogTimeEntryAction, WorkspaceAuditLogWorkspaceBillingCommercialAction, WorkspaceAuditLogWorkspaceBillingPortalAction, WorkspaceAuditLogWorkspaceLicenseAction, WorkspaceAuditLogWorkspaceMemberAction,  } from "../../domain/workspace-audit-log-entry.js"

export interface WorkspaceAuditEventDocProps {
  auditEventPublicId: string
  workspacePublicId: string
  category:
    | "scrum_backlog_item"
    | "scrum_sprint_board_item"
    | "kanban_backlog_item"
    | "kanban_board_item"
    | "time_entry"
    | "kanban_wip"
    | "workspace_member"
    | "workspace_license"
    | "workspace_billing_portal"
    | "workspace_billing_commercial"
    | "daily_alignment_session"
    | "guided_refinement_session"
    | "guided_review_session"
    | "guided_retrospective_session"
    | "guided_sprint_planning_session"
  action:
    | WorkspaceAuditLogScrumBacklogAction
    | WorkspaceAuditLogSprintBoardAction
    | WorkspaceAuditLogKanbanBacklogAction
    | WorkspaceAuditLogKanbanBoardAction
    | WorkspaceAuditLogTimeEntryAction
    | WorkspaceAuditLogKanbanWipAction
    | WorkspaceAuditLogWorkspaceMemberAction
    | WorkspaceAuditLogWorkspaceLicenseAction
    | WorkspaceAuditLogWorkspaceBillingPortalAction
    | WorkspaceAuditLogWorkspaceBillingCommercialAction
    | WorkspaceAuditLogDailyAlignmentAction
    | WorkspaceAuditLogGuidedRefinementAction
    | WorkspaceAuditLogGuidedReviewAction
    | WorkspaceAuditLogGuidedRetrospectiveAction
    | WorkspaceAuditLogGuidedSprintPlanningAction
  actorUserPublicId: string
  occurredAt: Date
  resourceProjectPublicId: string
  resourceBacklogItemPublicId: string | null
  /** `null` cuando no hay estado previo (p. ej. alta de miembro, apertura de portal). */
  previousValue: unknown | null
  nextValue: unknown
}
