import type { AuthMeAccessContext, AuthMeWorkspaceListItem } from "../dto/auth-me-access-context.dto.js"
import type { AuthMeWorkspaceContext } from "../dto/auth-me-workspace-context.dto.js"
import type { WorkspaceMemberRepository } from "../persistence/workspace-member.repository.js"
import type { WorkspaceIdentityRepository } from "../persistence/workspace-identity.repository.js"
import type { IdentityRegisteredUserForAuthRepository } from "../../login-session/persistence/identity-registered-user-for-auth.repository.js"
import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"

/**
 * Resolución de workspace activo y listado de membresías para sesión (fuente servidor, v1 WMI).
 */
export class AuthMeResolutionService {
  constructor(
    private readonly members: WorkspaceMemberRepository,
    private readonly workspaces: WorkspaceIdentityRepository,
    private readonly registeredUsers: IdentityRegisteredUserForAuthRepository,
    private readonly billingState: WorkspaceBillingStateService,
  ) {}

  async resolve(userPublicId: string, now = new Date()): Promise<AuthMeAccessContext> {
    const memberRows = await this.members.listByUserPublicId(userPublicId)
    const preferred = await this.registeredUsers.getPreferredActiveWorkspacePublicId(userPublicId)

    const workspaces: AuthMeWorkspaceListItem[] = []
    for (const m of memberRows) {
      const ws = await this.workspaces.findByWorkspacePublicId(m.workspacePublicId)
      if (!ws) continue

      let billingRestricted = false
      let utilizable = false
      try {
        const billing = await this.billingState.getBillingState(m.workspacePublicId, now)
        const canUse = billing.guards.canUsePrimaryWorkspaceProductFeatures
        if (m.status === "active" && canUse) {
          utilizable = true
        }
        if (!canUse && m.status !== "deactivated") {
          billingRestricted = true
        }
      } catch {
        billingRestricted = true
      }

      workspaces.push({
        workspacePublicId: ws.workspacePublicId,
        workspaceCode: ws.code,
        workspaceDisplayName: ws.displayName,
        membership: {
          membershipPublicId: m.membershipPublicId,
          status: m.status,
          workspaceRoleAdministrative: m.workspaceRoleAdministrative,
          workspaceRoleMethodological: m.workspaceRoleMethodological,
        },
        utilizableForOperations: utilizable,
        billingRestricted,
      })
    }

    const utilizableEntries = workspaces.filter((w) => w.utilizableForOperations)
    const noWorkspaceOwnerMemberships = workspaces.length === 0
    const noWorkspacesUtilizable = workspaces.length > 0 && utilizableEntries.length === 0

    const previousActiveWorkspaceInvalidated =
      preferred != null && !utilizableEntries.some((w) => w.workspacePublicId === preferred)

    let requiresWorkspaceSelection = false
    let workspace: AuthMeWorkspaceContext | null = null

    if (utilizableEntries.length === 1) {
      const w = utilizableEntries[0]!
      workspace = {
        workspacePublicId: w.workspacePublicId,
        workspaceCode: w.workspaceCode,
        workspaceDisplayName: w.workspaceDisplayName,
        membership: w.membership,
      }
    } else if (utilizableEntries.length > 1) {
      const picked =
        preferred && utilizableEntries.some((x) => x.workspacePublicId === preferred)
          ? utilizableEntries.find((x) => x.workspacePublicId === preferred)!
          : null
      if (picked) {
        workspace = {
          workspacePublicId: picked.workspacePublicId,
          workspaceCode: picked.workspaceCode,
          workspaceDisplayName: picked.workspaceDisplayName,
          membership: picked.membership,
        }
      } else {
        requiresWorkspaceSelection = true
      }
    }

    return {
      workspace,
      workspaces,
      workspaceAccess: {
        preferredActiveWorkspacePublicId: preferred,
        requiresWorkspaceSelection,
        noWorkspacesUtilizable,
        noWorkspaceOwnerMemberships,
        previousActiveWorkspaceInvalidated,
      },
    }
  }

  async setPreferredActiveWorkspace(
    userPublicId: string,
    workspacePublicId: string,
  ): Promise<
    { ok: true; access: AuthMeAccessContext } | { ok: false; code: "active_workspace_invalid" }
  > {
    const ctx = await this.resolve(userPublicId)
    const allowed = ctx.workspaces.some(
      (w) => w.workspacePublicId === workspacePublicId && w.utilizableForOperations,
    )
    if (!allowed) return { ok: false, code: "active_workspace_invalid" }
    await this.registeredUsers.setPreferredActiveWorkspacePublicId(userPublicId, workspacePublicId)
    return { ok: true, access: await this.resolve(userPublicId) }
  }
}
