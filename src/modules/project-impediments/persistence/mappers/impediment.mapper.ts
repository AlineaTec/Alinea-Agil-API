import type { ImpedimentState } from "../../domain/impediment.js"
import type { ImpedimentDocProps } from "../schemas/impediment.schema.js"

export function docToState(doc: ImpedimentDocProps): ImpedimentState {
  return {
    impedimentPublicId: doc.impedimentPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    relatedWorkItemPublicId: doc.relatedWorkItemPublicId,
    relatedSprintPublicId: doc.relatedSprintPublicId,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    severity: doc.severity,
    responsibleUserPublicId: doc.responsibleUserPublicId,
    reportedByUserPublicId: doc.reportedByUserPublicId,
    detectedAt: doc.detectedAt,
    resolvedAt: doc.resolvedAt,
    dismissedAt: doc.dismissedAt,
    resolutionSummary: doc.resolutionSummary,
    dismissalReason: doc.dismissalReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function stateToDoc(state: ImpedimentState): ImpedimentDocProps {
  return {
    impedimentPublicId: state.impedimentPublicId,
    workspacePublicId: state.workspacePublicId,
    projectPublicId: state.projectPublicId,
    relatedWorkItemPublicId: state.relatedWorkItemPublicId,
    relatedSprintPublicId: state.relatedSprintPublicId,
    title: state.title,
    description: state.description,
    status: state.status,
    severity: state.severity,
    responsibleUserPublicId: state.responsibleUserPublicId,
    reportedByUserPublicId: state.reportedByUserPublicId,
    detectedAt: state.detectedAt,
    resolvedAt: state.resolvedAt,
    dismissedAt: state.dismissedAt,
    resolutionSummary: state.resolutionSummary,
    dismissalReason: state.dismissalReason,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}
