import type { PersistenceSession as ClientSession } from "../../../infrastructure/persistence/persistence-session.js"
import { assertValidProjectKanbanFlowConfigState } from "../domain/kanban-flow.validation.js"
import { KanbanFlowNotFoundError } from "../domain/kanban-flow.errors.js"
import { buildDefaultKanbanFlowTemplate } from "../domain/kanban-flow-template.js"
import { KANBAN_WIP_V1_DEFAULT_NEAR_THRESHOLD_RATIO } from "../domain/kanban-flow-wip-defaults.js"
import type { KanbanColumnState, ProjectKanbanFlowConfigState } from "../domain/kanban-flow.js"
import type { KanbanFlowRepository } from "../persistence/kanban-flow.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { ProjectRuntimeInvalidInputError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { isOperationalApproach, type OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export class KanbanFlowService {
  constructor(
    private readonly repo: KanbanFlowRepository,
    private readonly projectRuntime: ProjectRuntimeService,
  ) {}

  findColumnByPublicId(
    flow: ProjectKanbanFlowConfigState,
    columnPublicId: string,
  ): KanbanColumnState | null {
    return flow.columns.find((c) => c.columnPublicId === columnPublicId) ?? null
  }

  async getFlowConfigForRead(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ProjectKanbanFlowConfigState> {
    assertCanReadProjectRuntime(actor)
    await this.projectRuntime.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    return this.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
  }

  async getFlowConfigOrThrow(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<ProjectKanbanFlowConfigState> {
    const row = await this.repo.findByProject(workspacePublicId, projectPublicId)
    if (!row) {
      throw new KanbanFlowNotFoundError()
    }
    return row
  }

  /**
   * Crea el flujo por defecto **una vez** al materializar un proyecto Kanban. Idempotente.
   */
  async ensureInitialFlowAfterKanbanMaterialization(
    workspacePublicId: string,
    projectPublicId: string,
    operationalApproach: OperationalApproach,
    session?: ClientSession,
  ): Promise<void> {
    if (!isOperationalApproach(operationalApproach)) {
      throw new ProjectRuntimeInvalidInputError("Invalid operational approach for Kanban flow.")
    }
    if (operationalApproach !== "kanban") {
      return
    }
    const existing = await this.repo.findByProject(workspacePublicId, projectPublicId, session)
    if (existing) return
    const tpl = buildDefaultKanbanFlowTemplate()
    const now = new Date()
    const state: ProjectKanbanFlowConfigState = {
      workspacePublicId,
      projectPublicId,
      entryColumnPublicId: tpl.entryColumnPublicId,
      wipNearThresholdRatio: KANBAN_WIP_V1_DEFAULT_NEAR_THRESHOLD_RATIO,
      columns: tpl.columns,
      createdAt: now,
      updatedAt: now,
    }
    assertValidProjectKanbanFlowConfigState(state)
    await this.repo.insert(state, session)
  }

  /**
   * Reemplaza la config persistida (p. ej. ajuste WIP); valida columnas y umbral `near` global.
   */
  async saveFlowConfig(state: ProjectKanbanFlowConfigState): Promise<void> {
    assertValidProjectKanbanFlowConfigState(state)
    await this.repo.replace(state)
  }
}
