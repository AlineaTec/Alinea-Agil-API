import assert from "node:assert/strict"
import test from "node:test"
import {
  assertWorkspaceBillingSeatAuthorized,
  WorkspaceLicensesForbiddenError,
} from "./billing-seat-enforcement-workspace.policy.js"

function actor(administrationRole: "admin" | "operator" | "auditor" | null, status: "active" | "deactivated" = "active") {
  const now = new Date()
  return {
    membershipPublicId: "m1",
    workspacePublicId: "w1",
    userPublicId: "u1",
    emailNormalized: "a@test.com",
    fullName: "A",
    status,
    hasSeatAssigned: true,
    workspaceRoleAdministrative: administrationRole,
    workspaceRoleMethodological: null,
    createdAt: now,
    updatedAt: now,
  }
}

test("view_state permite auditor", () => {
  assertWorkspaceBillingSeatAuthorized({ actor: actor("auditor"), action: "view_state" })
})

test("open_customer_portal rechaza auditor", () => {
  assert.throws(
    () => assertWorkspaceBillingSeatAuthorized({ actor: actor("auditor"), action: "open_customer_portal" }),
    WorkspaceLicensesForbiddenError,
  )
})

test("open_customer_portal permite admin y operator", () => {
  assertWorkspaceBillingSeatAuthorized({ actor: actor("admin"), action: "open_customer_portal" })
  assertWorkspaceBillingSeatAuthorized({ actor: actor("operator"), action: "open_customer_portal" })
})
