import type { Prisma, PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveSprintId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { ImpedimentState } from "../../domain/impediment.js"
import type {
  ImpedimentListFilters,
  ImpedimentListResult,
  ImpedimentRepository,
} from "../impediment.repository.js"
import { docToState } from "../mappers/impediment.mapper.js"
import type { ImpedimentDocProps } from "../schemas/impediment.schema.js"

type ImpedimentRow = {
  public_id: string
  workspace_public_id: string
  project_public_id: string
  related_work_item_public_id: string | null
  related_sprint_public_id: string | null
  title: string
  description: string
  status: ImpedimentDocProps["status"]
  severity: ImpedimentDocProps["severity"]
  responsible_user_public_id: string | null
  reported_by_user_public_id: string
  detected_at: Date
  resolved_at: Date | null
  dismissed_at: Date | null
  resolution_summary: string | null
  dismissal_reason: string | null
  created_at: Date
  updated_at: Date
}

function rowToDoc(row: ImpedimentRow): ImpedimentDocProps {
  return {
    impedimentPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    relatedWorkItemPublicId: row.related_work_item_public_id,
    relatedSprintPublicId: row.related_sprint_public_id,
    title: row.title,
    description: row.description,
    status: row.status,
    severity: row.severity,
    responsibleUserPublicId: row.responsible_user_public_id,
    reportedByUserPublicId: row.reported_by_user_public_id,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
    resolutionSummary: row.resolution_summary,
    dismissalReason: row.dismissal_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildWhere(
  workspaceId: string,
  projectId: string,
  filters: ImpedimentListFilters,
): Prisma.ProjectImpedimentWhereInput {
  const where: Prisma.ProjectImpedimentWhereInput = { workspace_id: workspaceId, project_id: projectId }
  if (filters.status !== undefined) {
    where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status
  }
  if (filters.severity !== undefined) where.severity = filters.severity
  if (filters.responsibleUserPublicId !== undefined) {
    where.responsible_user_public_id = filters.responsibleUserPublicId
  }
  if (filters.relatedWorkItemPublicId !== undefined) {
    where.related_work_item_public_id = filters.relatedWorkItemPublicId
  }
  if (filters.relatedSprintPublicId !== undefined) {
    where.related_sprint_public_id = filters.relatedSprintPublicId
  }
  return where
}

export class ImpedimentPrismaRepository implements ImpedimentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveIds(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<{ workspaceId: string; projectId: string } | null> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    if (!workspaceId || !projectId) return null
    return { workspaceId, projectId }
  }

  async insert(state: ImpedimentState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("impediment_insert_context_not_found")
    const relatedWorkItemId = state.relatedWorkItemPublicId
      ? await resolveWorkItemId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.relatedWorkItemPublicId,
        )
      : null
    const sprintId = state.relatedSprintPublicId
      ? await resolveSprintId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.relatedSprintPublicId,
        )
      : null
    await this.prisma.projectImpediment.create({
      data: {
        public_id: state.impedimentPublicId,
        workspace_id: ids.workspaceId,
        workspace_public_id: state.workspacePublicId,
        project_id: ids.projectId,
        project_public_id: state.projectPublicId,
        related_work_item_id: relatedWorkItemId,
        related_work_item_public_id: state.relatedWorkItemPublicId,
        related_sprint_public_id: state.relatedSprintPublicId,
        sprint_id: sprintId,
        title: state.title,
        description: state.description,
        status: state.status,
        severity: state.severity,
        responsible_user_public_id: state.responsibleUserPublicId,
        reported_by_user_public_id: state.reportedByUserPublicId,
        detected_at: state.detectedAt,
        resolved_at: state.resolvedAt,
        dismissed_at: state.dismissedAt,
        resolution_summary: state.resolutionSummary,
        dismissal_reason: state.dismissalReason,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
    })
  }

  async replace(state: ImpedimentState): Promise<void> {
    const ids = await this.resolveIds(state.workspacePublicId, state.projectPublicId)
    if (!ids) throw new Error("impediment_replace_context_not_found")
    const relatedWorkItemId = state.relatedWorkItemPublicId
      ? await resolveWorkItemId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.relatedWorkItemPublicId,
        )
      : null
    const sprintId = state.relatedSprintPublicId
      ? await resolveSprintId(
          this.prisma,
          state.workspacePublicId,
          state.projectPublicId,
          state.relatedSprintPublicId,
        )
      : null
    const res = await this.prisma.projectImpediment.updateMany({
      where: {
        public_id: state.impedimentPublicId,
        workspace_id: ids.workspaceId,
        project_id: ids.projectId,
      },
      data: {
        related_work_item_id: relatedWorkItemId,
        related_work_item_public_id: state.relatedWorkItemPublicId,
        related_sprint_public_id: state.relatedSprintPublicId,
        sprint_id: sprintId,
        title: state.title,
        description: state.description,
        status: state.status,
        severity: state.severity,
        responsible_user_public_id: state.responsibleUserPublicId,
        reported_by_user_public_id: state.reportedByUserPublicId,
        detected_at: state.detectedAt,
        resolved_at: state.resolvedAt,
        dismissed_at: state.dismissedAt,
        resolution_summary: state.resolutionSummary,
        dismissal_reason: state.dismissalReason,
        updated_at: state.updatedAt,
      },
    })
    if (res.count === 0) throw new Error("impediment_replace_missing")
  }

  async findByProjectAndId(
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ): Promise<ImpedimentState | null> {
    const row = await this.prisma.projectImpediment.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: impedimentPublicId,
      },
    })
    return row ? docToState(rowToDoc(row as ImpedimentRow)) : null
  }

  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    filters: ImpedimentListFilters,
    pagination: { limit: number; offset: number },
  ): Promise<ImpedimentListResult> {
    const ids = await this.resolveIds(workspacePublicId, projectPublicId)
    if (!ids) return { totalCount: 0, items: [] }
    const where = buildWhere(ids.workspaceId, ids.projectId, filters)
    const [totalCount, rows] = await Promise.all([
      this.prisma.projectImpediment.count({ where }),
      this.prisma.projectImpediment.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: pagination.offset,
        take: pagination.limit,
      }),
    ])
    return { totalCount, items: rows.map((r) => docToState(rowToDoc(r as ImpedimentRow))) }
  }
}
