import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { WorkspaceAuditLogAppendInput } from "../../workspace-audit-log/domain/workspace-audit-log-entry.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { WorkItemTimeEntryState, WorkItemTimeSummaryState } from "../domain/work-item-time-entry.js"
import { WorkItemTimeEntriesNotFoundError, WorkItemTimeEntriesValidationError } from "../domain/work-item-time-logging.errors.js"
import type {
  DeleteTimeEntryInput,
  ListTimeEntriesPageInput,
  UpdateTimeEntryInput,
  WorkItemTimeEntriesRepository,
} from "../persistence/work-item-time-entries.repository.js"
import { WorkItemTimeEntriesService, assertWorkDateYmdNotFuture, utcTodayYmd } from "./work-item-time-entries.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "proj-operational-1"
const item = "00000000-0000-4000-8000-0000000000aa"
const uDev = "u-dev"
const uSm = "u-sm"

class FakeTimeEntriesRepo implements WorkItemTimeEntriesRepository {
  rows: WorkItemTimeEntryState[] = []

  async insert(e: WorkItemTimeEntryState): Promise<void> {
    this.rows.push({ ...e })
  }

  async findByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    timeEntryPublicId: string,
  ): Promise<WorkItemTimeEntryState | null> {
    return (
      this.rows.find(
        (r) =>
          r.workspacePublicId === workspacePublicId &&
          r.projectPublicId === projectPublicId &&
          r.backlogItemPublicId === backlogItemPublicId &&
          r.timeEntryPublicId === timeEntryPublicId,
      ) ?? null
    )
  }

  async listPage(input: ListTimeEntriesPageInput): Promise<WorkItemTimeEntryState[]> {
    let list = this.rows.filter(
      (r) =>
        r.workspacePublicId === input.workspacePublicId &&
        r.projectPublicId === input.projectPublicId &&
        r.backlogItemPublicId === input.backlogItemPublicId,
    )
    list.sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime()
      if (t !== 0) return t
      return a.timeEntryPublicId.localeCompare(b.timeEntryPublicId)
    })
    if (input.after) {
      list = list.filter((r) => {
        if (r.createdAt.getTime() > input.after!.createdAt.getTime()) return true
        if (r.createdAt.getTime() === input.after!.createdAt.getTime()) {
          return r.timeEntryPublicId > input.after!.timeEntryPublicId
        }
        return false
      })
    }
    return list.slice(0, input.limit)
  }

  async getSummaryForItem(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ): Promise<WorkItemTimeSummaryState> {
    const list = this.rows.filter(
      (r) =>
        r.workspacePublicId === workspacePublicId &&
        r.projectPublicId === projectPublicId &&
        r.backlogItemPublicId === backlogItemPublicId,
    )
    if (list.length === 0) {
      return {
        workItemPublicId: backlogItemPublicId,
        totalLoggedMinutes: 0,
        entryCount: 0,
        lastLoggedAt: null,
        lastTimeEntryByUserPublicId: null,
      }
    }
    const total = list.reduce((a, b) => a + b.minutesSpent, 0)
    const last = [...list].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || b.timeEntryPublicId.localeCompare(a.timeEntryPublicId),
    )[0]!
    return {
      workItemPublicId: backlogItemPublicId,
      totalLoggedMinutes: total,
      entryCount: list.length,
      lastLoggedAt: last.createdAt,
      lastTimeEntryByUserPublicId: last.userPublicId,
    }
  }

  async update(input: UpdateTimeEntryInput): Promise<WorkItemTimeEntryState | null> {
    const r = await this.findByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.backlogItemPublicId,
      input.timeEntryPublicId,
    )
    if (!r) return null
    r.minutesSpent = input.minutesSpent
    r.workDate = input.workDate
    r.note = input.note
    r.updatedAt = input.updatedAt
    r.updatedByUserPublicId = input.updatedByUserPublicId
    return r
  }

  async delete(input: DeleteTimeEntryInput): Promise<boolean> {
    const i = this.rows.findIndex(
      (r) =>
        r.workspacePublicId === input.workspacePublicId &&
        r.projectPublicId === input.projectPublicId &&
        r.backlogItemPublicId === input.backlogItemPublicId &&
        r.timeEntryPublicId === input.timeEntryPublicId,
    )
    if (i < 0) return false
    this.rows.splice(i, 1)
    return true
  }

  async sumMinutesForUserProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    userPublicId: string,
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<number> {
    return this.rows
      .filter(
        (r) =>
          r.workspacePublicId === workspacePublicId &&
          r.projectPublicId === projectPublicId &&
          r.userPublicId === userPublicId &&
          r.workDate.getTime() >= workDateFromInclusiveUtc.getTime() &&
          r.workDate.getTime() < workDateToExclusiveUtc.getTime(),
      )
      .reduce((a, b) => a + b.minutesSpent, 0)
  }

  async aggregateMinutesByDevelopersForProjectWorkDateRange(
    workspacePublicId: string,
    projectPublicId: string,
    developerUserPublicIds: string[],
    workDateFromInclusiveUtc: Date,
    workDateToExclusiveUtc: Date,
  ): Promise<{ userPublicId: string; totalMinutes: number }[]> {
    const map = new Map<string, number>()
    for (const uid of developerUserPublicIds) {
      map.set(uid, 0)
    }
    for (const r of this.rows) {
      if (
        r.workspacePublicId === workspacePublicId &&
        r.projectPublicId === projectPublicId &&
        map.has(r.userPublicId) &&
        r.workDate.getTime() >= workDateFromInclusiveUtc.getTime() &&
        r.workDate.getTime() < workDateToExclusiveUtc.getTime()
      ) {
        map.set(r.userPublicId, (map.get(r.userPublicId) ?? 0) + r.minutesSpent)
      }
    }
    return [...map.entries()]
      .filter(([, total]) => total > 0)
      .map(([userPublicId, totalMinutes]) => ({ userPublicId, totalMinutes }))
  }
}

class FakeBacklog {
  item: ScrumBacklogItemState | null = {
    backlogItemPublicId: item,
    workspacePublicId: ws,
    projectPublicId: proj,
    itemType: "user_story",
    title: "T",
    description: "",
    status: "done",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: uSm,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedInSprintPublicId: null,
    assignedUserPublicId: uDev,
    assignmentUpdatedAt: new Date(),
    assignmentUpdatedByUserPublicId: uSm,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "none",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
  }
  async findByProjectAndItemId(
    _w: string,
    _p: string,
    backlogItemPublicId: string,
  ): Promise<ScrumBacklogItemState | null> {
    if (!this.item) return null
    return { ...this.item, backlogItemPublicId }
  }
}

class FakeProjectRuntime {
  last?: { w: string; p: string }
  async requireScrumOrKanbanWorkspaceRuntimeProject(w: string, p: string) {
    this.last = { w, p }
  }
}

class FakeAudit {
  appends: WorkspaceAuditLogAppendInput[] = []
  async append(input: WorkspaceAuditLogAppendInput): Promise<void> {
    this.appends.push(input)
  }
}

describe("WorkItemTimeEntriesService", () => {
  const backlog = new FakeBacklog() as import("../../project-scrum-backlog/persistence/scrum-backlog.repository.js").ScrumBacklogRepository
  const runtime = new FakeProjectRuntime() as any
  const repo = new FakeTimeEntriesRepo()
  const audit = new FakeAudit()
  const devActor = minimalWorkspaceMember({
    workspacePublicId: ws,
    userPublicId: uDev,
    workspaceRoleMethodological: "scrum_developer",
  })
  const smActor = minimalWorkspaceMember({
    workspacePublicId: ws,
    userPublicId: uSm,
    workspaceRoleMethodological: "scrum_master",
  })
  const auditorActor = minimalWorkspaceMember({
    workspacePublicId: ws,
    userPublicId: "u-aud",
    workspaceRoleAdministrative: "auditor",
  })

  const today = utcTodayYmd()

  const service = new WorkItemTimeEntriesService(
    repo,
    backlog,
    runtime,
    audit,
  )

  beforeEach(() => {
    repo.rows = []
    audit.appends = []
  })

  it("crea una entrada válida (minutos, fecha hoy) y deja rastro de auditoría", async () => {
    const e = await service.createTimeEntry(devActor, ws, proj, item, 45, today, "fix")
    assert.equal(e.userPublicId, uDev)
    assert.equal(e.minutesSpent, 45)
    const created = audit.appends.find((a) => a.action === "time_entry_created")
    assert.ok(created)
    assert.equal(created?.category, "time_entry")
  })

  it("lista y total derivado = suma de minutos", async () => {
    await service.createTimeEntry(devActor, ws, proj, item, 10, today, null)
    await service.createTimeEntry(devActor, ws, proj, item, 5, today, null)
    const { timeEntries, summary } = await service.listTimeEntries(devActor, ws, proj, item, 50, undefined)
    assert.equal(timeEntries.length, 2)
    assert.equal(summary.totalLoggedMinutes, 15)
    assert.equal(summary.entryCount, 2)
  })

  it("edita su propia entrada (PATCH)", async () => {
    const a = await service.createTimeEntry(devActor, ws, proj, item, 30, today, "a")
    const p = await service.patchTimeEntry(devActor, ws, proj, item, a.timeEntryPublicId, {
      minutesSpent: 20,
    })
    assert.equal(p.minutesSpent, 20)
    const upd = audit.appends.find((a) => a.action === "time_entry_updated")
    assert.ok(upd)
  })

  it("edita una entrada ajena como scrum_master (update-any)", async () => {
    const a = await service.createTimeEntry(devActor, ws, proj, item, 30, today, "x")
    const p = await service.patchTimeEntry(smActor, ws, proj, item, a.timeEntryPublicId, { minutesSpent: 40 })
    assert.equal(p.minutesSpent, 40)
  })

  it("rechaza edición de ajena para developer (update-any = sprint board)", async () => {
    const a = new WorkItemTimeEntriesService(
      repo,
      backlog,
      runtime,
      audit,
    )
    const e = await a.createTimeEntry(smActor, ws, proj, item, 1, today, null)
    await assert.rejects(
      () => a.patchTimeEntry(devActor, ws, proj, item, e.timeEntryPublicId, { minutesSpent: 2 }),
      /Only admin, operator, agility_lead, scrum_master, or product_owner/,
    )
  })

  it("borra la propia entrada", async () => {
    const e = await service.createTimeEntry(devActor, ws, proj, item, 5, today, null)
    await service.deleteTimeEntry(devActor, ws, proj, item, e.timeEntryPublicId)
    assert.equal(repo.rows.length, 0)
    assert.ok(audit.appends.some((a) => a.action === "time_entry_deleted"))
  })

  it("borra una entrada ajena como scrum_master", async () => {
    const e = await service.createTimeEntry(devActor, ws, proj, item, 5, today, null)
    await service.deleteTimeEntry(smActor, ws, proj, item, e.timeEntryPublicId)
    assert.equal(repo.rows.length, 0)
  })

  it("rechaza minutos cero vía servicio (numérico)", () => {
    return assert.rejects(
      service.createTimeEntry(devActor, ws, proj, item, 0, today, null),
      WorkItemTimeEntriesValidationError,
    )
  })

  it("rechaza minutos no enteros (numérico)", () => {
    return assert.rejects(
      service.createTimeEntry(devActor, ws, proj, item, 1.5, today, null),
      WorkItemTimeEntriesValidationError,
    )
  })

  it("rechaza fecha futura (UTC calendario)", () => {
    assert.throws(() => assertWorkDateYmdNotFuture("2099-01-01"), WorkItemTimeEntriesValidationError)
  })

  it("404 si el timeEntryPublicId no pertenece a ese item path", () => {
    return assert.rejects(
      (async () => {
        const e = await service.createTimeEntry(devActor, ws, proj, item, 1, today, null)
        const otherItem = "00000000-0000-4000-8000-0000000000bb"
        await service.patchTimeEntry(devActor, ws, proj, otherItem, e.timeEntryPublicId, { minutesSpent: 2 })
      })(),
      WorkItemTimeEntriesNotFoundError,
    )
  })

  it("auditoría: delete incluye last snapshot", async () => {
    const e = await service.createTimeEntry(devActor, ws, proj, item, 8, today, "n")
    await service.deleteTimeEntry(devActor, ws, proj, item, e.timeEntryPublicId)
    const del = audit.appends.filter((a) => a.action === "time_entry_deleted")
    assert.equal(del.length, 1)
    assert.ok((del[0]!.previousValue as { timeEntryPublicId: string }).timeEntryPublicId)
  })

  it("rechaza lectura por auditor en creación (no create)", () => {
    return assert.rejects(
      service.createTimeEntry(auditorActor, ws, proj, item, 1, today, null),
      /read-only/,
    )
  })
})
