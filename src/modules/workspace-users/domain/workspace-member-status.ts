export const WORKSPACE_MEMBER_STATUSES = [
  "pending",
  "active",
  "active_without_seat",
  "deactivated",
] as const
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUSES)[number]
