import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { ProductIdeaFeedbackEntryForbiddenError } from "../domain/product-idea-feedback.errors.js"

/** `idea-feedback.read-admin` — listado y detalle. */
export function assertPlatformSessionCanReadProductIdeaFeedbackEntry(
  _session: PlatformSessionContext,
): void {
  /* todos los roles plataforma activos (middleware ya excluyó inactivo) */
}

/** Mutación: `idea-feedback.review` + `idea-feedback.classify` — operador o super admin. */
export function assertPlatformSessionCanReviewProductIdeaFeedbackEntry(session: PlatformSessionContext): void {
  if (session.role === "platform_auditor") {
    throw new ProductIdeaFeedbackEntryForbiddenError(
      "forbidden",
      "El rol auditor de plataforma no puede modificar el feedback de producto.",
    )
  }
}

/** Detalle con PII: email no se expone por defecto en DTO; auditor ve menos campos (resuelto en servicio de respuesta). */
export function isPlatformAuditorSession(session: PlatformSessionContext): boolean {
  return session.role === "platform_auditor"
}
