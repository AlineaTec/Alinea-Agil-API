import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProductIdeaFeedbackEntryForbiddenError } from "../domain/product-idea-feedback.errors.js"

/**
 * Capability lógica: `idea-feedback.submit` — v1: miembro autenticado (no desactivado).
 */
export function assertCanSubmitProductIdeaFeedbackEntry(actor: WorkspaceMemberState): void {
  if (actor.status === "deactivated") {
    throw new ProductIdeaFeedbackEntryForbiddenError(
      "forbidden",
      "Los miembros desactivados no pueden enviar feedback de producto.",
    )
  }
}
