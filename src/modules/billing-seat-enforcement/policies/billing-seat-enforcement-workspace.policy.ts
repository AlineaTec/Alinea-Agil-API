import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  assertWorkspaceLicensesAuthorized,
  WorkspaceLicensesForbiddenError,
} from "../../workspace-licenses/policies/workspace-licenses-authorization.policy.js"

/** Misma barra base que licencias; portal de cobro sólo quien puede mutar licencias (admin/operator), no auditoría pura. */
export type WorkspaceBillingSeatAction = "view_state" | "open_customer_portal"

export function assertWorkspaceBillingSeatAuthorized(options: {
  actor: WorkspaceMemberState
  action: WorkspaceBillingSeatAction
}): void {
  if (options.action === "view_state") {
    assertWorkspaceLicensesAuthorized({
      actor: options.actor,
      action: "view_summary",
    })
    return
  }

  assertWorkspaceLicensesAuthorized({
    actor: options.actor,
    action: "mutate_license",
  })
}

export { WorkspaceLicensesForbiddenError }
