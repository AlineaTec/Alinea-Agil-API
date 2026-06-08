import { OPERATIONAL_APPROACHES, type OperationalApproach } from "../../domain/operational-approach.js"
import {
  type InitialConfigurationSummary,
  defaultInitialConfigurationSummary,
  initialConfigurationSummaryAfterMaterialization,
} from "../../domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../domain/workspace-runtime-project.js"
import { OPERATIONAL_PROJECT_STATUSES, type WorkspaceRuntimeProjectStatus } from "../../domain/operational-project-status.js"
import type { WorkspaceRuntimeProjectDocProps } from "../schemas/workspace-runtime-project.schema.js"

function parseApproach(raw: string): OperationalApproach {
  if ((OPERATIONAL_APPROACHES as readonly string[]).includes(raw)) {
    return raw as OperationalApproach
  }
  throw new Error(`invalid_operational_approach_persisted:${raw}`)
}

function parseSummary(doc: WorkspaceRuntimeProjectDocProps): InitialConfigurationSummary {
  const s = doc.initialConfigurationSummary
  const approach = parseApproach(doc.operationalApproach)
  if (s && typeof s === "object" && "kind" in s && s.kind === doc.operationalApproach) {
    const base = initialConfigurationSummaryAfterMaterialization(approach)
    const merged = { ...base, ...(s as Record<string, unknown>), kind: approach } as InitialConfigurationSummary
    // Proyectos materializados antes de activar backlog/sprints/tablero en producto: alinear lectura al estado actual.
    if (merged.kind === "scrum") {
      return {
        ...merged,
        backlog: true,
        sprints: true,
        board: true,
      }
    }
    if (merged.kind === "kanban") {
      return {
        ...merged,
        continuousBoard: true,
        baseColumns: true,
        wipPolicies: true,
        baseMetrics: true,
      }
    }
    return merged
  }
  return defaultInitialConfigurationSummary(approach)
}

function parseStatus(raw: string): WorkspaceRuntimeProjectStatus {
  if ((OPERATIONAL_PROJECT_STATUSES as readonly string[]).includes(raw)) {
    return raw as WorkspaceRuntimeProjectStatus
  }
  throw new Error(`invalid_operational_project_status_persisted:${raw}`)
}

export function docToWorkspaceRuntimeProjectState(doc: WorkspaceRuntimeProjectDocProps): WorkspaceRuntimeProjectState {
  const createdAt = doc.createdAt
  const updatedAt = doc.updatedAt
  const materializedAt = doc.materializedAt ?? createdAt
  return {
    projectPublicId: doc.projectPublicId,
    workspacePublicId: doc.workspacePublicId,
    sourceDraftPublicId: doc.sourceDraftPublicId,
    projectName: doc.projectName,
    operationalApproach: parseApproach(doc.operationalApproach),
    initialConfigurationSummary: parseSummary(doc),
    status: parseStatus(doc.status),
    materializedAt,
    createdAt,
    updatedAt,
  }
}
