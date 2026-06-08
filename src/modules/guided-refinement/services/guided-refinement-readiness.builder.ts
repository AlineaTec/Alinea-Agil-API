import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { GuidedRefinementReviewedItemState } from "../domain/guided-refinement-reviewed-item.js"
import type { GuidedReadinessSignalDto } from "../domain/guided-refinement-readiness-signal.js"

const guidanceMeta = { isBlocking: false, isGuidanceOnly: true }

export function buildGuidedReadinessSignals(
  approach: OperationalApproach,
  workItem: ScrumBacklogItemState,
  review: GuidedRefinementReviewedItemState,
): GuidedReadinessSignalDto[] {
  const signals: GuidedReadinessSignalDto[] = []

  if (workItem.acceptanceCriteria.length === 0) {
    signals.push({
      kind: "missing_acceptance_criteria",
      status: "suggested",
      explanation:
        "No hay criterios de aceptación registrados en el ítem; conviene clarificarlos antes del compromiso.",
      ...guidanceMeta,
    })
  }

  if (approach === "scrum" && workItem.storyPoints === null) {
    signals.push({
      kind: "estimation_recommended",
      status: "suggested",
      explanation:
        "No hay estimación en el ítem; en equipos Scrum suele recomendarse antes del planning — orientativo, no bloqueo global.",
      ...guidanceMeta,
    })
  }

  const depText = (review.dependenciesText ?? "").trim()
  if (depText.length > 0) {
    signals.push({
      kind: "open_dependency",
      status: "suggested",
      explanation: "Hay dependencias descritas; conviene asegurar visibilidad y acuerdo antes de comprometer.",
      ...guidanceMeta,
    })
  }

  if (review.sizeConcern === "large" || review.sizeConcern === "split_recommended") {
    signals.push({
      kind: "size_concern",
      status: "suggested",
      explanation: "El tamaño del ítem puede requerir división o más refinamiento antes del compromiso.",
      ...guidanceMeta,
    })
  }

  if (review.notReadyReasons.includes("insufficient_clarity")) {
    signals.push({
      kind: "insufficient_clarity",
      status: "suggested",
      explanation: "Se marcó claridad insuficiente; retomar en otra conversación o sesión.",
      ...guidanceMeta,
    })
  }

  if (review.notReadyReasons.includes("consensus_pending")) {
    signals.push({
      kind: "consensus_pending",
      status: "suggested",
      explanation: "Falta consenso explícito sobre preparación; el ítem puede quedar revisado pero no listo.",
      ...guidanceMeta,
    })
  }

  if (review.readyForPlanning) {
    signals.push({
      kind: review.readyWithObservations ? "ready_with_observations" : "ready_for_planning",
      status: "acknowledged",
      explanation: review.readyWithObservations
        ? "Marcado listo con observaciones — validación humana; no es compromiso de sprint."
        : "Marcado listo para el siguiente acto de compromiso — validación humana; no es compromiso de sprint.",
      isBlocking: false,
      isGuidanceOnly: false,
    })
  }

  return signals
}
