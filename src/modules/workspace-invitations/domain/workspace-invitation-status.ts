export const WORKSPACE_INVITATION_STATUSES = [
  "pending",
  "accepted",
  "expired",
  "revoked",
  "superseded",
] as const

export type WorkspaceInvitationStatus = (typeof WORKSPACE_INVITATION_STATUSES)[number]
