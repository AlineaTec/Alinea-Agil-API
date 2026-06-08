/**
 * Evaluación metodológica — variables mínimas (module-overview), en camelCase.
 * Valores deliberadamente flexibles hasta cerrar tipos por control (Likert, enum, etc.).
 *
 * Extensión futura (el motor `project-draft-recommendation-stub` ya tolera claves extra vía `Record`):
 * p. ej. `demandArrivalPattern`, `iterationBatchingFit`, `immediateResponseNeed` — hasta que existan en formulario.
 */
export type MethodologyAssessment = Partial<{
  workNature: unknown
  uncertaintyLevel: unknown
  scopeStability: unknown
  changeAcceptance: unknown
  deliveryShape: unknown
  interruptionFrequency: unknown
  prioritizationType: unknown
  teamComposition: unknown
  teamDedication: unknown
  autonomyLevel: unknown
  businessFeedbackAvailability: unknown
  crossAreaDependencies: unknown
  controlTraceabilityComplianceNeed: unknown
  dateCommitmentCriticality: unknown
  teamMethodologicalMaturity: unknown
}> &
  Record<string, unknown>
