import type { KanbanColumnState, ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import { KanbanFlowValidationError } from "../../project-kanban-core/domain/kanban-flow.errors.js"
import { assertValidProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.validation.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { makeWipColumnEvaluationForRead } from "../domain/kanban-wip-evaluation.js"
import {
  assertCanManageKanbanWip,
  assertCanReadKanbanWip,
} from "../policies/kanban-wip-authorization.policy.js"

export type KanbanWipColumnDto = {
  column_public_id: string
  name: string
  position: number
  limit: number | null
  policy: KanbanColumnState["wipEnforcement"]
  current_count: number
  ratio: number | null
  state: ReturnType<typeof makeWipColumnEvaluationForRead>["state"]
  near_threshold_ratio: number
  can_proceed_move_in: boolean
  requires_confirmation_for_next_add: boolean
  requires_override_for_next_add: boolean
}

export type KanbanWipConfigDto = {
  wip_near_threshold_ratio: number
  columns: KanbanWipColumnDto[]
  flow_updated_at: string
}

export class KanbanWipConfigValidationError extends Error {
  readonly code = "kanban_wip_config_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "KanbanWipConfigValidationError"
  }
}

export class KanbanWipConfigService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
    private readonly backlog: ScrumBacklogRepository,
    private readonly audit: WorkspaceAuditLogRepository | null,
  ) {}

  async getWip(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<KanbanWipConfigDto> {
    assertCanReadKanbanWip(actor)
    await this.projectRuntime.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    return this.loadDto(workspacePublicId, projectPublicId)
  }

  private async loadDto(workspacePublicId: string, projectPublicId: string): Promise<KanbanWipConfigDto> {
    const flow = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)
    const columnsSorted = flow.columns.slice().sort((a, b) => a.position - b.position)
    const columns: KanbanWipColumnDto[] = []
    for (const col of columnsSorted) {
      const currentCount = await this.backlog.countItemsInKanbanColumn(
        workspacePublicId,
        projectPublicId,
        col.columnPublicId,
      )
      const ev = makeWipColumnEvaluationForRead(col, currentCount, flow)
      columns.push({
        column_public_id: col.columnPublicId,
        name: col.name,
        position: col.position,
        limit: ev.limit,
        policy: ev.policy,
        current_count: ev.currentCount,
        ratio: ev.ratio,
        state: ev.state,
        near_threshold_ratio: ev.nearThresholdRatio,
        can_proceed_move_in: ev.canProceedMoveIn,
        requires_confirmation_for_next_add: ev.requiresConfirmationForNextAdd,
        requires_override_for_next_add: ev.requiresOverrideForNextAdd,
      })
    }
    return {
      wip_near_threshold_ratio: flow.wipNearThresholdRatio,
      columns,
      flow_updated_at: flow.updatedAt.toISOString(),
    }
  }

  async patchWip(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: {
      wipNearThresholdRatio?: number
      columnUpdates?: { columnPublicId: string; limit?: number | null; policy?: KanbanColumnState["wipEnforcement"] }[]
    },
  ): Promise<KanbanWipConfigDto> {
    assertCanManageKanbanWip(actor)
    await this.projectRuntime.requireKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const before = await this.kanbanFlowService.getFlowConfigOrThrow(workspacePublicId, projectPublicId)

    const nextColumns: KanbanColumnState[] = before.columns.map((c) => ({ ...c }))
    let near = before.wipNearThresholdRatio
    if (input.wipNearThresholdRatio !== undefined) {
      near = input.wipNearThresholdRatio
    }
    if (input.columnUpdates) {
      for (const u of input.columnUpdates) {
        const idx = nextColumns.findIndex((c) => c.columnPublicId === u.columnPublicId)
        if (idx === -1) {
          throw new KanbanWipConfigValidationError(`Unknown column_public_id: ${u.columnPublicId}.`)
        }
        const current = nextColumns[idx]!
        if (u.limit !== undefined) {
          current.wipLimit = u.limit
        }
        if (u.policy !== undefined) {
          current.wipEnforcement = u.policy
        }
        nextColumns[idx] = current
      }
    }

    const now = new Date()
    const state: ProjectKanbanFlowConfigState = {
      ...before,
      columns: nextColumns,
      wipNearThresholdRatio: near,
      updatedAt: now,
    }
    try {
      assertValidProjectKanbanFlowConfigState(state)
    } catch (e) {
      if (e instanceof KanbanFlowValidationError) {
        throw new KanbanWipConfigValidationError(e.message)
      }
      throw e
    }
    await this.kanbanFlowService.saveFlowConfig(state)

    if (this.audit) {
      const wipSnapshot = (f: ProjectKanbanFlowConfigState) => ({
        wip_near_threshold_ratio: f.wipNearThresholdRatio,
        columns: f.columns.map((c) => ({
          column_public_id: c.columnPublicId,
          limit: c.wipLimit,
          policy: c.wipEnforcement,
        })),
      })
      await this.audit.append({
        workspacePublicId,
        category: "kanban_wip",
        action: "wip_column_config_updated",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId: null },
        previousValue: wipSnapshot(before),
        nextValue: wipSnapshot(state),
      })
    }

    return this.loadDto(workspacePublicId, projectPublicId)
  }
}
