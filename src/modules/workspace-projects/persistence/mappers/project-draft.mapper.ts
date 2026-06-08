import { MANAGEMENT_APPROACHES, type ManagementApproach } from "../../domain/management-approach.js"
import type { MethodologyAssessment } from "../../domain/project-draft-assessment.js"
import type { ProjectDraftCharter } from "../../domain/project-draft-charter.js"
import type { MaterializationMeta } from "../../domain/project-draft-materialization.js"
import type { ProjectDraftState } from "../../domain/project-draft.js"
import type { RecommendationResult } from "../../domain/project-draft-recommendation.js"
import type { ProjectDraftStatus } from "../../domain/project-draft-status.js"
import { PROJECT_DRAFT_STATUSES } from "../../domain/project-draft-status.js"
import type { TraceEvent } from "../../domain/project-draft-trace.js"
import type { ProjectDraftDocProps } from "../schemas/project-draft.schema.js"

function isManagementApproach(v: string): v is ManagementApproach {
  return (MANAGEMENT_APPROACHES as readonly string[]).includes(v)
}

function parseApproach(raw: string | null | undefined): ManagementApproach | null {
  if (raw == null || raw === "") return null
  if (!isManagementApproach(raw)) {
    throw new Error(`invalid_management_approach_persisted:${raw}`)
  }
  return raw
}

function parseStatus(raw: string): ProjectDraftStatus {
  if (!(PROJECT_DRAFT_STATUSES as readonly string[]).includes(raw)) {
    throw new Error(`invalid_project_draft_status_persisted:${raw}`)
  }
  return raw as ProjectDraftStatus
}

function docToRecommendation(
  raw: Record<string, unknown> | null | undefined,
): RecommendationResult | null {
  if (raw == null) return null
  const suggestedApproach = parseApproach(typeof raw.suggestedApproach === "string" ? raw.suggestedApproach : null)
  const explanation = typeof raw.explanation === "string" ? raw.explanation : ""
  const computedAtRaw = raw.computedAt
  const computedAt =
    computedAtRaw instanceof Date ? computedAtRaw : new Date(String(computedAtRaw))
  if (!suggestedApproach) {
    throw new Error("recommendation_missing_suggested_approach")
  }
  const determinants =
    raw.determinants && typeof raw.determinants === "object" && !Array.isArray(raw.determinants)
      ? (raw.determinants as Record<string, unknown>)
      : undefined
  const engineVersion = typeof raw.engineVersion === "string" ? raw.engineVersion : undefined
  return {
    suggestedApproach,
    explanation,
    determinants,
    engineVersion,
    computedAt,
  }
}

function recommendationToDoc(r: RecommendationResult): Record<string, unknown> {
  return {
    suggestedApproach: r.suggestedApproach,
    explanation: r.explanation,
    determinants: r.determinants,
    engineVersion: r.engineVersion,
    computedAt: r.computedAt,
  }
}

export function docToState(doc: ProjectDraftDocProps): ProjectDraftState {
  return {
    draftPublicId: doc.draftPublicId,
    workspacePublicId: doc.workspacePublicId,
    createdByUserPublicId: doc.createdByUserPublicId,
    status: parseStatus(doc.status),
    projectName: doc.projectName,
    charter: { ...(doc.charter as ProjectDraftCharter) },
    methodologyAssessment: { ...(doc.methodologyAssessment as MethodologyAssessment) },
    recommendationResult: doc.recommendationResult
      ? docToRecommendation(doc.recommendationResult as Record<string, unknown>)
      : null,
    selectedApproach: parseApproach(doc.selectedApproach),
    wasRecommendationOverridden: doc.wasRecommendationOverridden,
    overrideJustification: doc.overrideJustification,
    materializedProjectPublicId: doc.materializedProjectPublicId,
    trace: (doc.trace ?? []).map((t) => ({
      type: t.type as TraceEvent["type"],
      at: t.at instanceof Date ? t.at : new Date(t.at),
      actorUserPublicId: t.actorUserPublicId,
      payload: t.payload,
    })),
    materialization: {
      status: doc.materialization.status,
      materializedProjectPublicId: doc.materialization.materializedProjectPublicId,
      lastError: doc.materialization.lastError,
      attemptedAt: doc.materialization.attemptedAt,
      completedAt: doc.materialization.completedAt,
    } satisfies MaterializationMeta,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function stateToDocProps(state: ProjectDraftState): ProjectDraftDocProps {
  return {
    draftPublicId: state.draftPublicId,
    workspacePublicId: state.workspacePublicId,
    createdByUserPublicId: state.createdByUserPublicId,
    status: state.status,
    projectName: state.projectName,
    charter: { ...state.charter },
    methodologyAssessment: { ...state.methodologyAssessment },
    recommendationResult: state.recommendationResult
      ? recommendationToDoc(state.recommendationResult)
      : null,
    selectedApproach: state.selectedApproach,
    wasRecommendationOverridden: state.wasRecommendationOverridden,
    overrideJustification: state.overrideJustification,
    materializedProjectPublicId: state.materializedProjectPublicId,
    trace: state.trace.map((t) => ({
      type: t.type,
      at: t.at,
      actorUserPublicId: t.actorUserPublicId,
      payload: t.payload,
    })),
    materialization: { ...state.materialization },
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}
