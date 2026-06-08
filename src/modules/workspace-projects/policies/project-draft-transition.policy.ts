import { OPERATIONAL_MANAGEMENT_APPROACHES } from "../domain/management-approach.js"
import type { MethodologyAssessment } from "../domain/project-draft-assessment.js"
import type { ProjectDraftCharter } from "../domain/project-draft-charter.js"
import { ProjectDraftInvalidOperationError, ProjectDraftInvalidTransitionError } from "../domain/project-draft.errors.js"
import type { ProjectDraftState } from "../domain/project-draft.js"
import type { ProjectDraftStatus } from "../domain/project-draft-status.js"
import { PROJECT_DRAFT_TERMINAL_STATUSES } from "../domain/project-draft-status.js"

/**
 * Gates mínimos conservadores hasta cerrar obligatoriedad en contracts-docs.
 * Sustituir por validación rica (Zod / reglas de negocio) cuando se cierren umbrales.
 */
export function charterSatisfiesReadyForAssessment(charter: ProjectDraftCharter): boolean {
  const name = typeof charter.name === "string" ? charter.name.trim() : ""
  const description =
    typeof charter.description === "string" ? charter.description.trim() : ""
  return name.length > 0 && description.length > 0
}

function countAssessmentEntries(assessment: MethodologyAssessment): number {
  const keys = Object.keys(assessment).filter((k) => assessment[k] !== undefined && assessment[k] !== null)
  return keys.length
}

/** Mínimo de claves respondidas para invocar el motor (conservador: 5). */
export function assessmentSatisfiesReadyForRecommendation(assessment: MethodologyAssessment): boolean {
  return countAssessmentEntries(assessment) >= 5
}

export function assertDraftNotTerminal(draft: ProjectDraftState): void {
  if (PROJECT_DRAFT_TERMINAL_STATUSES.has(draft.status)) {
    throw new ProjectDraftInvalidOperationError(
      `Draft is in terminal status "${draft.status}" and cannot be mutated.`,
    )
  }
}

/** Charter / assessment solo antes de recomendación persistida. */
export function assertCanEditCaptureSections(draft: ProjectDraftState): void {
  assertDraftNotTerminal(draft)
  const allowed: ProjectDraftStatus[] = [
    "definition_in_progress",
    "ready_for_assessment",
    "assessment_in_progress",
    "ready_for_recommendation",
  ]
  if (!allowed.includes(draft.status)) {
    throw new ProjectDraftInvalidOperationError(
      "Charter and assessment cannot be edited after a recommendation has been recorded.",
    )
  }
}

/**
 * Charter puede seguir evolucionando con el proyecto operativo mientras el borrador esté `materialized`
 * (la evaluación y el flujo del wizard quedan cerrados; ver `assertCanEditCaptureSections` en assessment).
 */
export function assertCanEditCharter(draft: ProjectDraftState): void {
  if (draft.status === "materialized") {
    return
  }
  assertCanEditCaptureSections(draft)
}

export function resolveStatusAfterSaveCharter(draft: ProjectDraftState): ProjectDraftStatus {
  const { status, charter } = draft
  if (status === "definition_in_progress" && charterSatisfiesReadyForAssessment(charter)) {
    return "ready_for_assessment"
  }
  return status
}

export function resolveStatusAfterSaveAssessment(draft: ProjectDraftState): ProjectDraftStatus {
  const { status, charter, methodologyAssessment } = draft

  if (!charterSatisfiesReadyForAssessment(charter)) {
    return "definition_in_progress"
  }

  if (status === "definition_in_progress") {
    return "assessment_in_progress"
  }

  if (status === "ready_for_assessment") {
    return "assessment_in_progress"
  }

  if (status === "assessment_in_progress") {
    return assessmentSatisfiesReadyForRecommendation(methodologyAssessment)
      ? "ready_for_recommendation"
      : "assessment_in_progress"
  }

  if (status === "ready_for_recommendation") {
    return assessmentSatisfiesReadyForRecommendation(methodologyAssessment)
      ? "ready_for_recommendation"
      : "assessment_in_progress"
  }

  return status
}

export function assertCanRecordRecommendation(draft: ProjectDraftState): void {
  assertDraftNotTerminal(draft)
  if (draft.status !== "ready_for_recommendation") {
    throw new ProjectDraftInvalidTransitionError(
      `Recommendation can only be recorded when status is ready_for_recommendation (current: ${draft.status}).`,
      { status: draft.status },
    )
  }
  if (!charterSatisfiesReadyForAssessment(draft.charter)) {
    throw new ProjectDraftInvalidTransitionError("Charter does not satisfy minimum gate for recommendation.", {
      status: draft.status,
      reason: "charter_incomplete",
    })
  }
  if (!assessmentSatisfiesReadyForRecommendation(draft.methodologyAssessment)) {
    throw new ProjectDraftInvalidTransitionError(
      "Methodology assessment does not satisfy minimum gate for recommendation.",
      { status: draft.status, reason: "assessment_incomplete" },
    )
  }
}

export function assertCanRecordDecision(draft: ProjectDraftState): void {
  assertDraftNotTerminal(draft)
  if (draft.status !== "recommended") {
    throw new ProjectDraftInvalidTransitionError(
      `Decision can only be recorded when status is recommended (current: ${draft.status}).`,
      { status: draft.status },
    )
  }
  if (!draft.recommendationResult) {
    throw new ProjectDraftInvalidTransitionError("Missing recommendation result.", { status: draft.status })
  }
}

export function assertCanMaterialize(draft: ProjectDraftState): void {
  if (draft.status === "materialized") {
    return
  }
  assertDraftNotTerminal(draft)
  if (draft.status !== "decision_recorded") {
    throw new ProjectDraftInvalidTransitionError(
      `Materialize requires status decision_recorded (current: ${draft.status}).`,
      { status: draft.status },
    )
  }
  const selected = draft.selectedApproach
  if (!selected || !OPERATIONAL_MANAGEMENT_APPROACHES.has(selected)) {
    throw new ProjectDraftInvalidOperationError(
      "Materialization requires an operational approach (scrum, kanban, or predictive_phases).",
    )
  }
}

export function assertCanMarkNotReadyComplete(draft: ProjectDraftState): void {
  if (draft.status === "not_ready_complete") {
    return
  }
  assertDraftNotTerminal(draft)
  if (draft.status !== "decision_recorded") {
    throw new ProjectDraftInvalidTransitionError(
      `not_ready_complete requires status decision_recorded (current: ${draft.status}).`,
      { status: draft.status },
    )
  }
  if (draft.selectedApproach !== "not_ready_to_start") {
    throw new ProjectDraftInvalidOperationError(
      'markNotReadyComplete only applies when selectedApproach is "not_ready_to_start".',
    )
  }
}
