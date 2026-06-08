import type { KanbanColumnState } from "../../../modules/project-kanban-core/domain/kanban-flow.js"
import { KanbanFlowPrismaRepository } from "../../../modules/project-kanban-core/persistence/prisma/kanban-flow.prisma-repository.js"
import { ScrumBacklogPrismaRepository } from "../../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { WorkControlsProjectProfilePrismaRepository } from "../../../modules/work-ready-done-controls/persistence/prisma/work-controls-project-profile.prisma-repository.js"
import { buildDefaultV1Criteria } from "../../../modules/work-ready-done-controls/domain/work-ready-done-build-default-criteria.js"
import type { SeedContext } from "./context.js"

export type KanbanColumnSpec = {
  columnPublicId: string
  name: string
  position: number
}

export async function seedKanbanFlow(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    entryColumnPublicId: string
    columns: KanbanColumnSpec[]
  },
): Promise<void> {
  const repo = new KanbanFlowPrismaRepository(ctx.prisma)
  const existing = await repo.findByProject(opts.workspacePublicId, opts.projectPublicId)
  if (existing) return

  const columns: KanbanColumnState[] = opts.columns.map((c) => ({
    columnPublicId: c.columnPublicId,
    name: c.name,
    position: c.position,
    wipLimit: c.position === 1 ? 5 : c.position === 2 ? 4 : null,
    policyText: "",
    wipEnforcement: c.position === 2 ? "warning" : "informational",
  }))

  const now = ctx.now
  await repo.insert({
    workspacePublicId: opts.workspacePublicId,
    projectPublicId: opts.projectPublicId,
    entryColumnPublicId: opts.entryColumnPublicId,
    wipNearThresholdRatio: 0.8,
    columns,
    createdAt: now,
    updatedAt: now,
  })
}

export type KanbanWorkItemSeedSpec = {
  publicId: string
  title: string
  description?: string
  columnPublicId: string | null
  sortOrder: number
  storyPoints?: number | null
  priorityLevel?: ScrumBacklogItemState["priorityLevel"]
  assignedUserPublicId?: string | null
  isBlocked?: boolean
  blockedReason?: string | null
  acceptanceCriteria?: ScrumBacklogItemState["acceptanceCriteria"]
}

function defaultAcceptanceCriteria(
  itemPublicId: string,
  now: Date,
  texts: string[],
): ScrumBacklogItemState["acceptanceCriteria"] {
  return texts.map((text, i) => ({
    acceptanceCriterionPublicId: `${itemPublicId}-ac${i + 1}`,
    text,
    status: i === texts.length - 1 ? ("done" as const) : ("pending" as const),
    createdAt: now,
    updatedAt: now,
  }))
}

export async function seedKanbanWorkItems(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    createdByUserPublicId: string
    items: KanbanWorkItemSeedSpec[]
  },
): Promise<void> {
  const backlog = new ScrumBacklogPrismaRepository(ctx.prisma)
  const now = ctx.now
  for (const item of opts.items) {
    const assigned = item.assignedUserPublicId ?? null
    const state: ScrumBacklogItemState = {
      backlogItemPublicId: item.publicId,
      workspacePublicId: opts.workspacePublicId,
      projectPublicId: opts.projectPublicId,
      itemType: "user_story",
      title: item.title,
      description: item.description ?? "",
      status: "open",
      sortOrder: item.sortOrder,
      parentItemPublicId: null,
      createdByUserPublicId: opts.createdByUserPublicId,
      createdAt: now,
      updatedAt: now,
      completedInSprintPublicId: null,
      assignedUserPublicId: assigned,
      assignmentUpdatedAt: assigned ? now : null,
      assignmentUpdatedByUserPublicId: assigned ? opts.createdByUserPublicId : null,
      assignmentHistory: assigned
        ? [
            {
              assignmentEventId: `${item.publicId}-assign-1`,
              changedAt: now,
              changedByUserPublicId: opts.createdByUserPublicId,
              previousAssignedUserPublicId: null,
              newAssignedUserPublicId: assigned,
              changeType: "assigned",
            },
          ]
        : [],
      storyPoints: item.storyPoints ?? 3,
      priorityLevel: item.priorityLevel ?? "medium",
      acceptanceCriteria:
        item.acceptanceCriteria ??
        defaultAcceptanceCriteria(item.publicId, now, [
          "Criterio funcional acordado con negocio",
          "Pruebas en ambiente QA sin regresiones críticas",
        ]),
      commentsCount: 0,
      kanbanColumnPublicId: item.columnPublicId,
      isBlocked: item.isBlocked ?? false,
      blockedReason: item.blockedReason ?? null,
    }
    const exists = await backlog.findByProjectAndItemId(
      opts.workspacePublicId,
      opts.projectPublicId,
      item.publicId,
    )
    if (!exists) await backlog.insert(state)
  }
  ctx.log(`Kanban: ${opts.items.length} work items`)
}

export async function seedKanbanWorkControls(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    startColumnPublicId: string
    doneColumnPublicId: string
  },
): Promise<void> {
  const profiles = new WorkControlsProjectProfilePrismaRepository(ctx.prisma)
  const now = ctx.now
  await profiles.upsert({
    workspacePublicId: opts.workspacePublicId,
    projectPublicId: opts.projectPublicId,
    approach: "kanban",
    version: 1,
    definitionSource: "project",
    criteria: buildDefaultV1Criteria(),
    kanbanColumnMapping: {
      startExecutionColumnPublicId: opts.startColumnPublicId,
      doneCloseItemColumnPublicId: opts.doneColumnPublicId,
    },
    createdAt: now,
    updatedAt: now,
  })
}
