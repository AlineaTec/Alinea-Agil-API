import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { ProductFeedbackReviewStatus } from "../domain/product-feedback-submission.js"
import { ProductFeedbackForbiddenError } from "../domain/product-feedback.errors.js"

export function assertPlatformSessionCanReadProductFeedback(_session: PlatformSessionContext): void {
  /* todos los roles plataforma activos */
}

export function assertPlatformSessionCanMutateProductFeedback(session: PlatformSessionContext): void {
  if (session.role === "platform_auditor") {
    throw new ProductFeedbackForbiddenError(
      "forbidden",
      "El rol auditor de plataforma no puede modificar envíos de feedback de producto.",
    )
  }
}

export function assertPlatformSessionCanSetActionableStatus(session: PlatformSessionContext): void {
  if (session.role !== "platform_operator" && session.role !== "platform_super_admin") {
    throw new ProductFeedbackForbiddenError(
      "forbidden_actionable",
      "Solo operador o super administrador de plataforma pueden marcar envíos como accionables.",
    )
  }
}

export function isPlatformAuditorSession(session: PlatformSessionContext): boolean {
  return session.role === "platform_auditor"
}

export function applyActionableGuard(
  session: PlatformSessionContext,
  nextStatus: ProductFeedbackReviewStatus | undefined,
): void {
  if (nextStatus === "actionable") {
    assertPlatformSessionCanSetActionableStatus(session)
  }
}
