import type { WorkspaceMemberState } from "../modules/workspace-users/domain/workspace-member.js"

/** Actor mínimo válido para asserts de política Scrum (tests). */
export function minimalWorkspaceMember(
  partial: Partial<WorkspaceMemberState> = {},
): WorkspaceMemberState {
  return {
    membershipPublicId: "m-test",
    workspacePublicId: "w-test",
    userPublicId: "u-test",
    emailNormalized: "user@test.dev",
    fullName: "Test User",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  }
}
