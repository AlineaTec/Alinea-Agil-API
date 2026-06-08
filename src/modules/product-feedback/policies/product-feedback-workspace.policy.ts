import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProductFeedbackForbiddenError } from "../domain/product-feedback.errors.js"

/** Miembro autenticado activo puede enviar (equivalente lógico a `idea-feedback.submit`). */
export function assertCanSubmitProductFeedback(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProductFeedbackForbiddenError(
      "forbidden",
      "Los miembros desactivados no pueden enviar feedback de producto.",
    )
  }
}
