import type { ManagementApproach } from "./management-approach.js"

/** Salida persistida del motor tras `recordRecommendation`. */
export type RecommendationResult = {
  suggestedApproach: ManagementApproach
  explanation: string
  /** Factores o señales que explican la sugerencia (opcional, motor futuro). */
  determinants?: Record<string, unknown>
  engineVersion?: string
  computedAt: Date
}
