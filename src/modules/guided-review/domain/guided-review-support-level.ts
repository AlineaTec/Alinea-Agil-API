import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

/**
 * Scrum: experiencia completa.
 * Kanban: review de entrega/flujo (degradada, no oculta módulo — OQ-GREV-10).
 * Predictive: no operativo en v1 para mutaciones (honestidad metodológica).
 */
export type GuidedReviewSupportLevel = "full" | "flow_delivery_review" | "unsupported"

export function supportLevelForGuidedReview(approach: OperationalApproach): GuidedReviewSupportLevel {
  if (approach === "scrum") return "full"
  if (approach === "kanban") return "flow_delivery_review"
  return "unsupported"
}
