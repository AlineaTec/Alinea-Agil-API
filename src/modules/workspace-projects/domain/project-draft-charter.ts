/**
 * Charter ligero — atributos alineados a module-overview (nombres en camelCase).
 * Se permite `Record<string, unknown>` para extensión sin romper persistencia.
 */
export type ProjectDraftCharter = {
  /** Nombre del proyecto */
  name?: string
  description?: string
  problemOrOpportunity?: string
  generalObjective?: string
  initialScope?: string
  expectedBenefits?: string
  mainStakeholders?: string
  targetDateOrTimeWindow?: string
  knownConstraints?: string
  successCriteria?: string
  initialRisks?: string
  mainResponsible?: string
  organizationalContext?: string
} & Record<string, unknown>
