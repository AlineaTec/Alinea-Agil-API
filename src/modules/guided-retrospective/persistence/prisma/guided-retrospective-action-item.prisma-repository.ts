import { Prisma, type PrismaClient } from "@prisma/client"
import { resolveGuidedRetrospectiveSessionId } from "../../../../infrastructure/postgres/guided-sessions-scope.js"
import {
  resolveProjectId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  GuidedRetrospectiveActionItemHistoryEntry,
  GuidedRetrospectiveActionItemState,
} from "../../domain/guided-retrospective-action-item.js"
import type { GuidedRetrospectiveActionItemRepository } from "../guided-retrospective-action-item.repository.js"
import type { GuidedRetrospectiveActionItem } from "@prisma/client"

function normalizePriority(v: unknown): GuidedRetrospectiveActionItemState["priority"] {
  return v === "low" || v === "medium" || v === "high" ? v : "medium"
}

function normalizeStatus(v: unknown): GuidedRetrospectiveActionItemState["status"] {
  const s = typeof v === "string" ? v : ""
  if (s === "open") return "pending"
  if (s === "done") return "finished"
  const ok: GuidedRetrospectiveActionItemState["status"][] = [
    "pending",
    "analyzing",
    "executing",
    "reviewing",
    "finished",
    "dropped",
  ]
  if (ok.includes(s as GuidedRetrospectiveActionItemState["status"])) {
    return s as GuidedRetrospectiveActionItemState["status"]
  }
  return "pending"
}

function parseHistory(raw: unknown): GuidedRetrospectiveActionItemHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((h) => {
    const entry = h as GuidedRetrospectiveActionItemHistoryEntry & { occurredAt: string | Date }
    return {
      historyEntryPublicId: entry.historyEntryPublicId,
      actorUserPublicId: entry.actorUserPublicId,
      occurredAt:
        entry.occurredAt instanceof Date ? entry.occurredAt : new Date(entry.occurredAt),
      kind: entry.kind,
      message: entry.message,
    }
  })
}

function rowToState(row: GuidedRetrospectiveActionItem): GuidedRetrospectiveActionItemState {
  return {
    actionItemPublicId: row.public_id,
    sessionPublicId: row.session_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    title: row.title,
    description: row.description,
    ownerUserPublicId: row.owner_user_public_id,
    dueDate: row.due_date,
    priority: normalizePriority(row.priority),
    sourceContributionIds: [...row.source_contribution_ids],
    sourceTopicPublicIds: [...row.source_topic_public_ids],
    status: normalizeStatus(row.status),
    history: parseHistory(row.history),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** PostgreSQL: `guided_retrospective_action_items`. */
export class GuidedRetrospectiveActionItemPrismaRepository
  implements GuidedRetrospectiveActionItemRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async listBySession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState[]> {
    const rows = await this.prisma.guidedRetrospectiveActionItem.findMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        session_public_id: sessionPublicId,
      },
      orderBy: { created_at: "asc" },
    })
    return rows.map(rowToState)
  }

  async replaceAllForSession(
    workspacePublicId: string,
    projectPublicId: string,
    sessionPublicId: string,
    rows: GuidedRetrospectiveActionItemState[],
  ): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, workspacePublicId, projectPublicId)
    const sessionId = await resolveGuidedRetrospectiveSessionId(
      this.prisma,
      workspacePublicId,
      projectPublicId,
      sessionPublicId,
    )
    if (!workspaceId || !projectId || !sessionId) {
      throw new Error("guided_retrospective_action_item_replace_context_not_found")
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.guidedRetrospectiveActionItem.deleteMany({
        where: {
          workspace_public_id: workspacePublicId,
          project_public_id: projectPublicId,
          session_public_id: sessionPublicId,
        },
      })
      if (rows.length === 0) return
      await tx.guidedRetrospectiveActionItem.createMany({
        data: rows.map((r) => ({
          public_id: r.actionItemPublicId,
          session_id: sessionId,
          session_public_id: r.sessionPublicId,
          workspace_id: workspaceId,
          workspace_public_id: r.workspacePublicId,
          project_id: projectId,
          project_public_id: r.projectPublicId,
          title: r.title,
          description: r.description,
          owner_user_public_id: r.ownerUserPublicId,
          due_date: r.dueDate,
          priority: r.priority,
          source_contribution_ids: r.sourceContributionIds,
          source_topic_public_ids: r.sourceTopicPublicIds,
          status: r.status,
          history: (r.history ?? []) as Prisma.InputJsonValue,
          created_at: r.createdAt,
          updated_at: r.updatedAt,
        })),
      })
    })
  }

  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState[]> {
    const rows = await this.prisma.guidedRetrospectiveActionItem.findMany({
      where: { workspace_public_id: workspacePublicId, project_public_id: projectPublicId },
      orderBy: { updated_at: "desc" },
    })
    return rows.map(rowToState)
  }

  async findByPublicId(
    workspacePublicId: string,
    projectPublicId: string,
    actionItemPublicId: string,
  ): Promise<GuidedRetrospectiveActionItemState | null> {
    const row = await this.prisma.guidedRetrospectiveActionItem.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: actionItemPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async applyPatchWithHistory(
    workspacePublicId: string,
    projectPublicId: string,
    actionItemPublicId: string,
    fields: Partial<
      Pick<
        GuidedRetrospectiveActionItemState,
        "title" | "description" | "ownerUserPublicId" | "dueDate" | "priority" | "status"
      >
    >,
    newHistory: GuidedRetrospectiveActionItemHistoryEntry[],
    updatedAt: Date,
  ): Promise<GuidedRetrospectiveActionItemState | null> {
    const existing = await this.findByPublicId(workspacePublicId, projectPublicId, actionItemPublicId)
    if (!existing) return null

    const data: Prisma.GuidedRetrospectiveActionItemUncheckedUpdateManyInput = {
      updated_at: updatedAt,
    }
    if (fields.title !== undefined) data.title = fields.title
    if (fields.description !== undefined) data.description = fields.description
    if (fields.ownerUserPublicId !== undefined) data.owner_user_public_id = fields.ownerUserPublicId
    if (fields.dueDate !== undefined) data.due_date = fields.dueDate
    if (fields.priority !== undefined) data.priority = fields.priority
    if (fields.status !== undefined) data.status = fields.status
    if (newHistory.length > 0) {
      data.history = [...existing.history, ...newHistory] as Prisma.InputJsonValue
    }

    const res = await this.prisma.guidedRetrospectiveActionItem.updateMany({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        public_id: actionItemPublicId,
      },
      data,
    })
    if (res.count === 0) return null
    return this.findByPublicId(workspacePublicId, projectPublicId, actionItemPublicId)
  }
}
