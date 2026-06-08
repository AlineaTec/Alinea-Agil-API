import type { Prisma, PrismaClient } from "@prisma/client"
import {
  resolveProjectId,
  resolveWorkItemId,
} from "../../../../infrastructure/postgres/project-scope.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type {
  DeleteTimeEntryInput,
  ListTimeEntriesPageInput,
  UpdateTimeEntryInput,
  WorkItemTimeEntriesRepository,
} from "../work-item-time-entries.repository.js"
import type { WorkItemTimeEntryState, WorkItemTimeSummaryState } from "../../domain/work-item-time-entry.js"

function rowToState(row: {
  public_id: string
  workspace_public_id: string
  project_public_id: string
  work_item_public_id: string
  user_public_id: string
  minutes_spent: number
  work_date: Date
  note: string | null
  created_by_user_public_id: string
  updated_by_user_public_id: string
  created_at: Date
  updated_at: Date
}): WorkItemTimeEntryState {
  return {
    timeEntryPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    backlogItemPublicId: row.work_item_public_id,
    userPublicId: row.user_public_id,
    minutesSpent: row.minutes_spent,
    workDate: row.work_date,
    note: row.note,
    createdByUserPublicId: row.created_by_user_public_id,
    updatedByUserPublicId: row.updated_by_user_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class WorkItemTimeEntriesPrismaRepository implements WorkItemTimeEntriesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(e: WorkItemTimeEntryState): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, e.workspacePublicId)
    const projectId = await resolveProjectId(this.prisma, e.workspacePublicId, e.projectPublicId)
    const workItemId = await resolveWorkItemId(
      this.prisma,
      e.workspacePublicId,
      e.projectPublicId,
      e.backlogItemPublicId,
    )
    if (!workspaceId || !projectId || !workItemId) {
      throw new Error("work_item_time_entry_insert_context_not_found")
    }
    await this.prisma.workItemTimeEntry.create({
      data: {
        public_id: e.timeEntryPublicId,
        workspace_id: workspaceId,
        workspace_public_id: e.workspacePublicId,
        project_id: projectId,
        project_public_id: e.projectPublicId,
        work_item_id: workItemId,
        work_item_public_id: e.backlogItemPublicId,
        user_public_id: e.userPublicId,
        minutes_spent: e.minutesSpent,
        work_date: e.workDate,
        note: e.note,
        created_by_user_public_id: e.createdByUserPublicId,
        updated_by_user_public_id: e.updatedByUserPublicId,
        created_at: e.createdAt,
        updated_at: e.updatedAt,
      },
    })
  }

  async findByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    timeEntryPublicId: string,
  ): Promise<WorkItemTimeEntryState | null> {
    const row = await this.prisma.workItemTimeEntry.findFirst({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        work_item_public_id: backlogItemPublicId,
        public_id: timeEntryPublicId,
      },
    })
    return row ? rowToState(row) : null
  }

  async listPage(input: ListTimeEntriesPageInput): Promise<WorkItemTimeEntryState[]> {
    const where: Prisma.WorkItemTimeEntryWhereInput = {
      workspace_public_id: input.workspacePublicId,
      project_public_id: input.projectPublicId,
      work_item_public_id: input.backlogItemPublicId,
    }
    if (input.after) {
      where.OR = [
        { created_at: { gt: input.after.createdAt } },
        {
          created_at: input.after.createdAt,
          public_id: { gt: input.after.timeEntryPublicId },
        },
      ]
    }
    const rows = await this.prisma.workItemTimeEntry.findMany({
      where,
      orderBy: [{ created_at: "asc" }, { public_id: "asc" }],
      take: input.limit,
    })
    return rows.map(rowToState)
  }

  async getSummaryForItem(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemTimeSummaryState> {
    const where = {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      work_item_public_id: backlogItemPublicId,
    }
    const agg = await this.prisma.workItemTimeEntry.aggregate({
      where,
      _sum: { minutes_spent: true },
      _count: { _all: true },
    })
    if (agg._count._all === 0) {
      return {
        workItemPublicId: backlogItemPublicId,
        totalLoggedMinutes: 0,
        entryCount: 0,
        lastLoggedAt: null,
        lastTimeEntryByUserPublicId: null,
      }
    }
    const last = await this.prisma.workItemTimeEntry.findFirst({
      where,
      orderBy: [{ created_at: "desc" }, { public_id: "desc" }],
    })
    return {
      workItemPublicId: backlogItemPublicId,
      totalLoggedMinutes: agg._sum.minutes_spent ?? 0,
      entryCount: agg._count._all,
      lastLoggedAt: last?.created_at ?? null,
      lastTimeEntryByUserPublicId: last?.user_public_id ?? null,
    }
  }

  async update(input: UpdateTimeEntryInput): Promise<WorkItemTimeEntryState | null> {
    const res = await this.prisma.workItemTimeEntry.updateMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        work_item_public_id: input.backlogItemPublicId,
        public_id: input.timeEntryPublicId,
      },
      data: {
        minutes_spent: input.minutesSpent,
        work_date: input.workDate,
        note: input.note,
        updated_at: input.updatedAt,
        updated_by_user_public_id: input.updatedByUserPublicId,
      },
    })
    if (res.count === 0) return null
    return this.findByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.backlogItemPublicId,
      input.timeEntryPublicId,
    )
  }

  async delete(input: DeleteTimeEntryInput): Promise<boolean> {
    const res = await this.prisma.workItemTimeEntry.deleteMany({
      where: {
        workspace_public_id: input.workspacePublicId,
        project_public_id: input.projectPublicId,
        work_item_public_id: input.backlogItemPublicId,
        public_id: input.timeEntryPublicId,
      },
    })
    return res.count > 0
  }

  async sumMinutesForUserProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<number> {
    const agg = await this.prisma.workItemTimeEntry.aggregate({
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        user_public_id: userPublicId,
        work_date: { gte: workDateFromInclusiveUtc, lt: workDateToExclusiveUtc },
      },
      _sum: { minutes_spent: true },
    })
    return agg._sum.minutes_spent ?? 0
  }

  async aggregateMinutesByDevelopersForProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    developerUserPublicIds: string[],
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<{ userPublicId: string; totalMinutes: number }[]> {
    if (developerUserPublicIds.length === 0) return []
    const rows = await this.prisma.workItemTimeEntry.groupBy({
      by: ["user_public_id"],
      where: {
        workspace_public_id: workspacePublicId,
        project_public_id: projectPublicId,
        user_public_id: { in: developerUserPublicIds },
        work_date: { gte: workDateFromInclusiveUtc, lt: workDateToExclusiveUtc },
      },
      _sum: { minutes_spent: true },
    })
    return rows.map((r) => ({
      userPublicId: r.user_public_id,
      totalMinutes: r._sum.minutes_spent ?? 0,
    }))
  }
}
