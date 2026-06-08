import type { Prisma, PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import type { ProjectKanbanFlowConfigState, KanbanColumnState } from "../../domain/kanban-flow.js"
import { KanbanFlowNotFoundError } from "../../domain/kanban-flow.errors.js"
import { docToProjectKanbanFlowConfigState } from "../mappers/kanban-flow.mapper.js"
import type { KanbanFlowRepository } from "../kanban-flow.repository.js"
import { resolveProjectId } from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { KanbanColumn, KanbanFlowConfig } from "@prisma/client"

const FLOW_DEFINITION_V2: Prisma.InputJsonValue = { schemaVersion: 2 }

function columnRowToState(row: KanbanColumn): KanbanColumnState {
  return {
    columnPublicId: row.public_id,
    name: row.name,
    position: row.position,
    wipLimit: row.wip_limit,
    policyText: row.policy_text,
    wipEnforcement: row.wip_enforcement as KanbanColumnState["wipEnforcement"],
  }
}

function flowWithColumnsToState(
  row: KanbanFlowConfig & { kanban_columns: KanbanColumn[] },
): ProjectKanbanFlowConfigState {
  const columns = [...row.kanban_columns]
    .sort((a, b) => a.position - b.position)
    .map(columnRowToState)
  return docToProjectKanbanFlowConfigState({
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    entryColumnPublicId: row.entry_column_public_id,
    wipNearThresholdRatio: row.wip_near_threshold_ratio ?? undefined,
    columns,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function columnStateToCreate(
  col: KanbanColumnState,
  ids: {
    kanbanFlowConfigId: string
    workspaceId: string
    workspacePublicId: string
    projectId: string
    projectPublicId: string
  },
): Prisma.KanbanColumnUncheckedCreateWithoutKanban_flow_configInput {
  return {
    public_id: col.columnPublicId,
    workspace_id: ids.workspaceId,
    workspace_public_id: ids.workspacePublicId,
    project_id: ids.projectId,
    project_public_id: ids.projectPublicId,
    name: col.name,
    position: col.position,
    wip_limit: col.wipLimit,
    policy_text: col.policyText,
    wip_enforcement: col.wipEnforcement,
  }
}

async function syncKanbanColumns(
  prisma: PrismaClient,
  flowConfigId: string,
  state: ProjectKanbanFlowConfigState,
  scopeIds: {
    workspaceId: string
    workspacePublicId: string
    projectId: string
    projectPublicId: string
  },
): Promise<void> {
  const desiredPublicIds = state.columns.map((c) => c.columnPublicId)
  for (const col of state.columns) {
    await prisma.kanbanColumn.upsert({
      where: {
        kanban_flow_config_id_public_id: {
          kanban_flow_config_id: flowConfigId,
          public_id: col.columnPublicId,
        },
      },
      create: {
        ...columnStateToCreate(col, { kanbanFlowConfigId: flowConfigId, ...scopeIds }),
        kanban_flow_config_id: flowConfigId,
      },
      update: {
        name: col.name,
        position: col.position,
        wip_limit: col.wipLimit,
        policy_text: col.policyText,
        wip_enforcement: col.wipEnforcement,
        updated_at: state.updatedAt,
      },
    })
  }
  if (desiredPublicIds.length > 0) {
    await prisma.kanbanColumn.deleteMany({
      where: {
        kanban_flow_config_id: flowConfigId,
        public_id: { notIn: desiredPublicIds },
      },
    })
  } else {
    await prisma.kanbanColumn.deleteMany({ where: { kanban_flow_config_id: flowConfigId } })
  }
}

/** PostgreSQL: `kanban_flow_configs` + `kanban_columns` (fuente de verdad de columnas). */
export class KanbanFlowPrismaRepository implements KanbanFlowRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: ProjectKanbanFlowConfigState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    const projectId = await resolveProjectId(
      this.prisma,
      state.workspacePublicId,
      state.projectPublicId,
    )
    if (!workspaceId || !projectId) throw new Error("kanban_flow_insert_context_not_found")
    const scopeIds = {
      workspaceId,
      workspacePublicId: state.workspacePublicId,
      projectId,
      projectPublicId: state.projectPublicId,
    }
    const created = await this.prisma.kanbanFlowConfig.create({
      data: {
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: projectId,
        project_public_id: state.projectPublicId,
        entry_column_public_id: state.entryColumnPublicId,
        wip_near_threshold_ratio: state.wipNearThresholdRatio,
        flow_definition: FLOW_DEFINITION_V2,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
      select: { id: true },
    })
    await syncKanbanColumns(this.prisma, created.id, state, scopeIds)
  }

  async replace(state: ProjectKanbanFlowConfigState, _session?: ClientSession): Promise<void> {
    const row = await this.prisma.kanbanFlowConfig.findFirst({
      where: {
        workspace_public_id: state.workspacePublicId,
        project_public_id: state.projectPublicId,
      },
      select: { id: true, workspace_id: true, project_id: true },
    })
    if (!row) throw new KanbanFlowNotFoundError()
    const res = await this.prisma.kanbanFlowConfig.updateMany({
      where: { id: row.id },
      data: {
        entry_column_public_id: state.entryColumnPublicId,
        wip_near_threshold_ratio: state.wipNearThresholdRatio,
        flow_definition: FLOW_DEFINITION_V2,
        updated_at: state.updatedAt,
      },
    })
    if (res.count === 0) throw new KanbanFlowNotFoundError()
    await syncKanbanColumns(this.prisma, row.id, state, {
      workspaceId: row.workspace_id,
      workspacePublicId: state.workspacePublicId,
      projectId: row.project_id,
      projectPublicId: state.projectPublicId,
    })
  }

  async findByProject(
    workspacePublicId: string,
    projectPublicId: string,
    _session?: ClientSession,
  ): Promise<ProjectKanbanFlowConfigState | null> {
    const row = await this.prisma.kanbanFlowConfig.findFirst({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      include: { kanban_columns: true },
    })
    return row ? flowWithColumnsToState(row) : null
  }
}
