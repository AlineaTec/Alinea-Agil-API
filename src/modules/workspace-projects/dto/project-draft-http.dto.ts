import type { ProjectDraftState } from "../domain/project-draft.js"

function iso(d: Date | undefined): string | undefined {
  return d ? d.toISOString() : undefined
}

/** Serialización JSON para respuestas HTTP (sin lógica de negocio). */
export function projectDraftToHttpBody(state: ProjectDraftState): Record<string, unknown> {
  return {
    draftPublicId: state.draftPublicId,
    workspacePublicId: state.workspacePublicId,
    createdByUserPublicId: state.createdByUserPublicId,
    status: state.status,
    projectName: state.projectName,
    charter: state.charter,
    methodologyAssessment: state.methodologyAssessment,
    recommendationResult: state.recommendationResult
      ? {
          suggestedApproach: state.recommendationResult.suggestedApproach,
          explanation: state.recommendationResult.explanation,
          determinants: state.recommendationResult.determinants,
          engineVersion: state.recommendationResult.engineVersion,
          computedAt: state.recommendationResult.computedAt.toISOString(),
        }
      : null,
    selectedApproach: state.selectedApproach,
    wasRecommendationOverridden: state.wasRecommendationOverridden,
    overrideJustification: state.overrideJustification,
    materializedProjectPublicId: state.materializedProjectPublicId,
    trace: state.trace.map((t) => ({
      type: t.type,
      at: t.at.toISOString(),
      actorUserPublicId: t.actorUserPublicId,
      payload: t.payload,
    })),
    materialization: {
      status: state.materialization.status,
      materializedProjectPublicId: state.materialization.materializedProjectPublicId,
      lastError: state.materialization.lastError,
      attemptedAt: iso(state.materialization.attemptedAt),
      completedAt: iso(state.materialization.completedAt),
    },
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  }
}
