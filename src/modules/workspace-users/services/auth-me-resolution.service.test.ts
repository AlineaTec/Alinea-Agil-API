import assert from "node:assert/strict"
import { test } from "node:test"

import type { WorkspaceBillingStateService } from "../../billing-seat-enforcement/services/workspace-billing-state.service.js"
import type { IdentityRegisteredUserForAuthRepository } from "../../login-session/persistence/identity-registered-user-for-auth.repository.js"
import type { WorkspaceMemberState } from "../domain/workspace-member.js"
import type { WorkspaceIdentityRepository, WorkspaceIdentitySnapshot } from "../persistence/workspace-identity.repository.js"
import type { WorkspaceMemberRepository } from "../persistence/workspace-member.repository.js"
import { AuthMeResolutionService } from "./auth-me-resolution.service.js"

const W1 = "10000000-0000-4000-8000-000000000001"
const W2 = "20000000-0000-4000-8000-000000000002"
const INTENT_ID = "30000000-0000-4000-8000-000000000003"

class MemMembers implements WorkspaceMemberRepository {
  rows: WorkspaceMemberState[] = []
  async findByMembershipPublicId(): Promise<WorkspaceMemberState | null> {
    return null
  }
  async findByWorkspaceAndEmail(): Promise<WorkspaceMemberState | null> {
    return null
  }
  async findByWorkspaceAndUserPublicId(): Promise<WorkspaceMemberState | null> {
    return null
  }
  async listByWorkspacePublicId(): Promise<WorkspaceMemberState[]> {
    return []
  }
  async listByWorkspaceFiltered(): Promise<{ items: WorkspaceMemberState[]; totalCount: number }> {
    return { items: [], totalCount: 0 }
  }
  async countByWorkspaceFiltered(): Promise<number> {
    return 0
  }
  async aggregateStatusStatsByWorkspace() {
    return { total: 0, pending: 0, active: 0, active_without_seat: 0, deactivated: 0 }
  }
  async listByUserPublicId(userPublicId: string): Promise<WorkspaceMemberState[]> {
    return this.rows.filter((r) => r.userPublicId === userPublicId)
  }
  async countOtherActiveAdministrativeAdmins(): Promise<number> {
    return 0
  }
  async countActiveSeatConsumingMembers(): Promise<number> {
    return 0
  }
  async insert(): Promise<void> {}
  async replace(): Promise<void> {}
  async deleteByMembershipPublicId(): Promise<void> {}
}

class MemIdentity implements WorkspaceIdentityRepository {
  byId = new Map<string, WorkspaceIdentitySnapshot>()
  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceIdentitySnapshot | null> {
    return this.byId.get(workspacePublicId) ?? null
  }
}

class MemRegistered implements IdentityRegisteredUserForAuthRepository {
  preferred = new Map<string, string | null>()
  async findByEmailNormalized(): Promise<null> {
    return null
  }
  async findProfileByUserPublicId(): Promise<null> {
    return null
  }
  async findCredentialByUserPublicId(): Promise<null> {
    return null
  }
  async applyProfileUpdates(): Promise<boolean> {
    return true
  }
  async getPreferredActiveWorkspacePublicId(userPublicId: string): Promise<string | null> {
    return this.preferred.get(userPublicId) ?? null
  }
  async setPreferredActiveWorkspacePublicId(
    userPublicId: string,
    workspacePublicId: string | null,
  ): Promise<boolean> {
    this.preferred.set(userPublicId, workspacePublicId)
    return true
  }
}

function billingStub(
  canUseByWs: Record<string, boolean>,
): WorkspaceBillingStateService {
  return {
    async getBillingState(workspacePublicId: string) {
      const canUse = canUseByWs[workspacePublicId] ?? true
      return {
        guards: {
          canUsePrimaryWorkspaceProductFeatures: canUse,
        },
      }
    },
  } as unknown as WorkspaceBillingStateService
}

function baseMember(
  userPublicId: string,
  workspacePublicId: string,
  status: WorkspaceMemberState["status"] = "active",
): WorkspaceMemberState {
  const now = new Date()
  return {
    membershipPublicId: `m-${workspacePublicId}`,
    workspacePublicId,
    userPublicId,
    emailNormalized: "u@example.com",
    fullName: "User",
    status,
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: null,
    createdAt: now,
    updatedAt: now,
  }
}

test("resolve: sin membresías → noWorkspaceOwnerMemberships", async () => {
  const members = new MemMembers()
  const id = new MemIdentity()
  const reg = new MemRegistered()
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({}))
  const ctx = await svc.resolve("user-1")
  assert.equal(ctx.workspaces.length, 0)
  assert.equal(ctx.workspaceAccess.noWorkspaceOwnerMemberships, true)
  assert.equal(ctx.workspaceAccess.noWorkspacesUtilizable, false)
  assert.equal(ctx.workspace, null)
})

test("resolve: un workspace utilizable → workspace resuelto", async () => {
  const members = new MemMembers()
  members.rows.push(baseMember("user-1", W1))
  const id = new MemIdentity()
  id.byId.set(W1, {
    workspacePublicId: W1,
    code: "ws1",
    displayName: "WS Uno",
    modality: "individual",
    sourceRegistrationIntentPublicId: INTENT_ID,
  })
  const reg = new MemRegistered()
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: true }))
  const ctx = await svc.resolve("user-1")
  assert.equal(ctx.workspaces.length, 1)
  assert.equal(ctx.workspace?.workspacePublicId, W1)
  assert.equal(ctx.workspaceAccess.requiresWorkspaceSelection, false)
})

test("resolve: varios utilizable y preferido válido → mismo preferido", async () => {
  const members = new MemMembers()
  members.rows.push(baseMember("user-1", W1), baseMember("user-1", W2))
  const id = new MemIdentity()
  for (const w of [W1, W2]) {
    id.byId.set(w, {
      workspacePublicId: w,
      code: w.slice(-2),
      displayName: `WS ${w.slice(-2)}`,
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
  }
  const reg = new MemRegistered()
  reg.preferred.set("user-1", W2)
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: true, [W2]: true }))
  const ctx = await svc.resolve("user-1")
  assert.equal(ctx.workspace?.workspacePublicId, W2)
  assert.equal(ctx.workspaceAccess.requiresWorkspaceSelection, false)
})

test("resolve: varios utilizable sin preferido válido → requiresWorkspaceSelection", async () => {
  const members = new MemMembers()
  members.rows.push(baseMember("user-1", W1), baseMember("user-1", W2))
  const id = new MemIdentity()
  for (const w of [W1, W2]) {
    id.byId.set(w, {
      workspacePublicId: w,
      code: w.slice(-2),
      displayName: `WS ${w.slice(-2)}`,
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
  }
  const reg = new MemRegistered()
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: true, [W2]: true }))
  const ctx = await svc.resolve("user-1")
  assert.equal(ctx.workspace, null)
  assert.equal(ctx.workspaceAccess.requiresWorkspaceSelection, true)
})

test("resolve: preferido ya no utilizable → previousActiveWorkspaceInvalidated", async () => {
  const members = new MemMembers()
  members.rows.push(baseMember("user-1", W1))
  const id = new MemIdentity()
  id.byId.set(W1, {
    workspacePublicId: W1,
    code: "ws1",
    displayName: "WS Uno",
    modality: "individual",
    sourceRegistrationIntentPublicId: INTENT_ID,
  })
  const reg = new MemRegistered()
  reg.preferred.set("user-1", W1)
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: false }))
  const ctx = await svc.resolve("user-1")
  assert.equal(ctx.workspace, null)
  assert.equal(ctx.workspaceAccess.noWorkspacesUtilizable, true)
  assert.equal(ctx.workspaceAccess.previousActiveWorkspaceInvalidated, true)
})

test("setPreferredActiveWorkspace: solo permite workspace utilizable", async () => {
  const members = new MemMembers()
  members.rows.push(baseMember("user-1", W1))
  const id = new MemIdentity()
  id.byId.set(W1, {
    workspacePublicId: W1,
    code: "ws1",
    displayName: "WS Uno",
    modality: "individual",
    sourceRegistrationIntentPublicId: INTENT_ID,
  })
  const reg = new MemRegistered()
  const svc = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: false }))
  const bad = await svc.setPreferredActiveWorkspace("user-1", W1)
  assert.equal(bad.ok, false)
  assert.equal(bad.code, "active_workspace_invalid")

  const svc2 = new AuthMeResolutionService(members, id, reg, billingStub({ [W1]: true }))
  const ok = await svc2.setPreferredActiveWorkspace("user-1", W1)
  assert.equal(ok.ok, true)
  assert.equal(ok.access.workspace?.workspacePublicId, W1)
})
