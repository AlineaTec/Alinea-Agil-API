import type { ProjectDraftCharter } from "./project-draft-charter.js"

/** Alineado al tope del PATCH HTTP (charter) por campo. */
const FIELD_MAX = 20_000

function fieldText(s: unknown): string | null {
  if (typeof s !== "string") return null
  const t = s.trim()
  if (!t.length) return null
  return t.length <= FIELD_MAX ? t : `${t.slice(0, FIELD_MAX - 1)}…`
}

/**
 * Texto de charter para listado / summary de proyecto: todos los campos del contrato
 * `ProjectDraftCharter` reconocidos en el producto (sin claves ad hoc desconocidas).
 */
export type OperationalListCharterSnapshotDto = {
  name: string | null
  description: string | null
  problemOrOpportunity: string | null
  generalObjective: string | null
  initialScope: string | null
  expectedBenefits: string | null
  mainStakeholders: string | null
  targetDateOrTimeWindow: string | null
  knownConstraints: string | null
  successCriteria: string | null
  initialRisks: string | null
  mainResponsible: string | null
  organizationalContext: string | null
}

export function toOperationalListCharterSnapshot(charter: ProjectDraftCharter): OperationalListCharterSnapshotDto {
  return {
    name: fieldText(charter.name),
    description: fieldText(charter.description),
    problemOrOpportunity: fieldText(charter.problemOrOpportunity),
    generalObjective: fieldText(charter.generalObjective),
    initialScope: fieldText(charter.initialScope),
    expectedBenefits: fieldText(charter.expectedBenefits),
    mainStakeholders: fieldText(charter.mainStakeholders),
    targetDateOrTimeWindow: fieldText(charter.targetDateOrTimeWindow),
    knownConstraints: fieldText(charter.knownConstraints),
    successCriteria: fieldText(charter.successCriteria),
    initialRisks: fieldText(charter.initialRisks),
    mainResponsible: fieldText(charter.mainResponsible),
    organizationalContext: fieldText(charter.organizationalContext),
  }
}

export function isOperationalListCharterSnapshotEmpty(s: OperationalListCharterSnapshotDto): boolean {
  return !(
    s.name ||
    s.description ||
    s.problemOrOpportunity ||
    s.generalObjective ||
    s.initialScope ||
    s.expectedBenefits ||
    s.mainStakeholders ||
    s.targetDateOrTimeWindow ||
    s.knownConstraints ||
    s.successCriteria ||
    s.initialRisks ||
    s.mainResponsible ||
    s.organizationalContext
  )
}
