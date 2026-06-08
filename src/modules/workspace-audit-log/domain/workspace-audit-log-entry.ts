/** Proyecto ficticio para eventos de gobernanza workspace (sin proyecto operativo). */
export const WORKSPACE_AUDIT_GOVERNANCE_SENTINEL_PROJECT_PUBLIC_ID =
  "00000000-0000-4000-8000-000000000001" as const

/**
 * Actor sintético para jobs e integraciones servidor (webhooks, reconciliaciones).
 * No corresponde a un usuario de producto.
 */
export const WORKSPACE_AUDIT_INTEGRATION_ACTOR_USER_PUBLIC_ID =
  "00000000-0000-4000-8000-000000000002" as const

export type WorkspaceAuditLogCategory =
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

export type WorkspaceAuditLogDailyAlignmentAction =
  | "daily_alignment_session_created_lazy"
  | "daily_alignment_participant_update_upserted"
  | "daily_alignment_session_closed"
  | "daily_alignment_facilitator_transcript_updated"

export type WorkspaceAuditLogGuidedRefinementAction =
  | "guided_refinement_session_created_lazy"
  | "guided_refinement_session_header_upserted"
  | "guided_refinement_item_review_upserted"
  | "guided_refinement_session_closed"
  | "guided_refinement_additive_note_appended"

export type WorkspaceAuditLogGuidedReviewAction =
  | "guided_review_session_created_lazy"
  | "guided_review_session_header_upserted"
  | "guided_review_demonstrated_item_upserted"
  | "guided_review_feedback_appended"
  | "guided_review_session_closed"
  | "guided_review_transcript_after_close_upserted"
  | "guided_review_additive_note_appended"

export type WorkspaceAuditLogGuidedRetrospectiveAction =
  | "guided_retrospective_session_created_lazy"
  | "guided_retrospective_session_header_upserted"
  | "guided_retrospective_joined_by_code"
  | "guided_retrospective_contribution_created"
  | "guided_retrospective_guest_contribution_created"
  | "guided_retrospective_topic_created"
  | "guided_retrospective_contribution_grouped"
  | "guided_retrospective_topics_merged"
  | "guided_retrospective_session_closed"
  | "guided_retrospective_transcript_after_close_upserted"
  | "guided_retrospective_additive_note_appended"
  | "guided_retrospective_action_item_patched"

export type WorkspaceAuditLogGuidedSprintPlanningAction =
  | "guided_sprint_planning_session_created_lazy"
  | "guided_sprint_planning_session_header_upserted"
  | "guided_sprint_planning_candidate_decision_upserted"
  | "guided_sprint_planning_session_closed"
  | "guided_sprint_planning_transcript_after_close_upserted"
  | "guided_sprint_planning_additive_note_appended"

export type WorkspaceAuditLogScrumBacklogAction =
  | "story_points_updated"
  | "priority_level_updated"
  | "acceptance_criteria_updated"
  | "work_item_assignment_changed"

export type WorkspaceAuditLogKanbanBacklogAction = "released_to_flow" | "returned_to_backlog"

export type WorkspaceAuditLogKanbanBoardAction = "moved_between_columns" | "reordered_in_column" | "blocked" | "unblocked"

export type WorkspaceAuditLogSprintBoardAction = "moved_between_columns" | "reordered_in_column"

export type WorkspaceAuditLogTimeEntryAction = "time_entry_created" | "time_entry_updated" | "time_entry_deleted"

export type WorkspaceAuditLogKanbanWipAction = "wip_column_config_updated" | "wip_move_override_applied"

export type WorkspaceAuditLogWorkspaceMemberAction =
  | "member_created"
  | "member_deactivated"
  | "member_activated"
  | "seat_assigned"
  | "seat_released"
  | "member_roles_updated"
  | "member_removed"

export type WorkspaceAuditLogWorkspaceLicenseAction =
  | "seats_purchased_increased"
  | "seat_reduction_scheduled"
  | "scheduled_reduction_cleared"
  | "trusted_absolute_seats_purchased_applied"
  | "license_renewal_cycle_applied"

export type WorkspaceAuditLogWorkspaceBillingPortalAction = "customer_portal_session_opened"

export type WorkspaceAuditLogWorkspaceBillingCommercialAction =
  | "paddle_checkout_session_created"
  | "paddle_team_seat_increase_applied"
  | "paddle_team_seat_reduction_scheduled"
  | "paddle_upgrade_individual_to_team_applied"

export type WorkspaceAuditLogAppendInput = {
  workspacePublicId: string
  category: WorkspaceAuditLogCategory
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
  resource: {
    projectPublicId: string
    /** Eventos a nivel flujo: `null`. Override en movimiento: ítem. */
    backlogItemPublicId: string | null
  }
  /** JSON-serializable; Mixed en persistencia. Usa `null` cuando no hay estado previo (p. ej. `member_created`). */
  previousValue: unknown | null
  nextValue: unknown
}
