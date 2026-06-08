import { randomUUID } from "node:crypto"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkItemTimeEntryListCursor, WorkItemTimeEntryState, WorkItemTimeSummaryState } from "../domain/work-item-time-entry.js"
import { WorkItemTimeEntriesNotFoundError, WorkItemTimeEntriesValidationError } from "../domain/work-item-time-logging.errors.js"
import {
  assertCanCreateTimeEntry,
  assertCanDeleteTimeEntry,
  assertCanReadTimeEntries,
  assertCanUpdateTimeEntry,
  assertTimeEntryRequestWorkspaceMatchesActor,
  timeEntryIsAuthoredByActor,
} from "../policies/work-item-time-entries-authorization.policy.js"
import type { WorkItemTimeEntriesRepository } from "../persistence/work-item-time-entries.repository.js"
import { TIME_ENTRY_MINUTES_MAX } from "../validation/work-item-time-entries-http.schemas.js"

const DEFAULT_PAGE = 20

/**
 * Día de trabajo: instante 00:00:00.000Z del calendario UTC para `YYYY-MM-DD`.
 * La regla "no futuro" se compara con la fecha de calendario UTC de hoy.
 */
export function workDateYmdToUtcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`)
}

export function utcTodayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

export function assertWorkDateYmdNotFuture(ymd: string): void {
  const today = utcTodayYmd()
  if (ymd > today) {
    throw new WorkItemTimeEntriesValidationError("workDate cannot be a future day (v1, UTC calendar).")
  }
}

function encodeCursor(c: WorkItemTimeEntryListCursor): string {
  return Buffer.from(
    JSON.stringify({ t: c.createdAt.toISOString(), id: c.timeEntryPublicId }),
    "utf8",
  ).toString("base64url")
}

function decodeCursor(raw: string | undefined): WorkItemTimeEntryListCursor | null {
  if (!raw || raw.length === 0) return null
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const data = JSON.parse(json) as { t?: string; id?: string }
    if (typeof data.t !== "string" || typeof data.id !== "string") return null
    const createdAt = new Date(data.t)
    if (Number.isNaN(createdAt.getTime())) return null
    return { createdAt, timeEntryPublicId: data.id }
  } catch {
    return null
  }
}

type AuditPayload = {
  timeEntryPublicId: string
  userPublicId: string
  minutesSpent: number
  workDateYmd: string
  note: string | null
}

function snapshotForAudit(e: WorkItemTimeEntryState): AuditPayload {
  return {
    timeEntryPublicId: e.timeEntryPublicId,
    userPublicId: e.userPublicId,
    minutesSpent: e.minutesSpent,
    workDateYmd: e.workDate.toISOString().slice(0, 10),
    note: e.note,
  }
}

function validateMinutesInDomain(m: number): void {
  if (!Number.isInteger(m) || m <= 0) {
    throw new WorkItemTimeEntriesValidationError("minutesSpent must be a positive integer (minutes).")
  }
  if (m > TIME_ENTRY_MINUTES_MAX) {
    throw new WorkItemTimeEntriesValidationError(`minutesSpent must not exceed ${TIME_ENTRY_MINUTES_MAX} (24h).`)
  }
}

export class WorkItemTimeEntriesService {
  constructor(
    private readonly entriesRepo: WorkItemTimeEntriesRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly auditLogRepository: WorkspaceAuditLogRepository | null = null,
  ) {}

  private async requireBacklogItemExists(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ) {
    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) {
      throw new WorkItemTimeEntriesNotFoundError("Backlog item not found.")
    }
    return item
  }

  private assertActorWorkspace(actor: WorkspaceMemberState, workspacePublicId: string): void {
    assertTimeEntryRequestWorkspaceMatchesActor(workspacePublicId, actor)
  }

  async listTimeEntries(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    limitInput: number | undefined,
    cursorRaw: string | undefined,
  ): Promise<{
    timeEntries: WorkItemTimeEntryState[]
    nextCursor: string | null
    summary: WorkItemTimeSummaryState
  }> {
    this.assertActorWorkspace(actor, workspacePublicId)
    assertCanReadTimeEntries(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const limit = Math.min(limitInput ?? DEFAULT_PAGE, 50)
    const after = decodeCursor(cursorRaw)
    if (cursorRaw && after === null) {
      throw new WorkItemTimeEntriesValidationError("Invalid cursor.")
    }

    const [pageRows, summary] = await Promise.all([
      this.entriesRepo.listPage({
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        limit: limit + 1,
        after,
      }),
      this.entriesRepo.getSummaryForItem(workspacePublicId, projectPublicId, backlogItemPublicId),
    ])
    const hasMore = pageRows.length > limit
    const page = hasMore ? pageRows.slice(0, limit) : pageRows
    let nextCursor: string | null = null
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!
      nextCursor = encodeCursor({ createdAt: last.createdAt, timeEntryPublicId: last.timeEntryPublicId })
    }
    return { timeEntries: page, nextCursor, summary }
  }

  async createTimeEntry(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    minutesSpent: number,
    workDateYmd: string,
    note: string | null | undefined,
  ): Promise<WorkItemTimeEntryState> {
    this.assertActorWorkspace(actor, workspacePublicId)
    assertCanReadTimeEntries(actor)
    assertCanCreateTimeEntry(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    assertWorkDateYmdNotFuture(workDateYmd)
    validateMinutesInDomain(minutesSpent)
    const n = note === undefined || note === null ? null : note.trim() === "" ? null : note.trim()
    if (n && [...n].length > 2000) {
      throw new WorkItemTimeEntriesValidationError("note must not exceed 2000 characters.")
    }
    // v1: permitir en ítems en cualquier `status` (incl. done) — work realizable post cierre, sin archivado aún en modelo.
    const now = new Date()
    const workDate = workDateYmdToUtcDate(workDateYmd)
    const state: WorkItemTimeEntryState = {
      timeEntryPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      userPublicId: actor.userPublicId,
      minutesSpent,
      workDate,
      note: n,
      createdAt: now,
      updatedAt: now,
      createdByUserPublicId: actor.userPublicId,
      updatedByUserPublicId: actor.userPublicId,
    }
    await this.entriesRepo.insert(state)
    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "time_entry",
        action: "time_entry_created",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        /** Auditoría: usar objeto vacío en lugar de `null` en payload requerido. */
        previousValue: {},
        nextValue: snapshotForAudit(state),
      })
    }
    return state
  }

  async patchTimeEntry(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    timeEntryPublicId: string,
    body: { minutesSpent?: number; workDate?: string; note?: string | null },
  ): Promise<WorkItemTimeEntryState> {
    this.assertActorWorkspace(actor, workspacePublicId)
    assertCanReadTimeEntries(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const existing = await this.entriesRepo.findByIds(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      timeEntryPublicId,
    )
    if (!existing) {
      throw new WorkItemTimeEntriesNotFoundError()
    }
    const isAuthor = timeEntryIsAuthoredByActor(existing.createdByUserPublicId, actor)
    assertCanUpdateTimeEntry(actor, isAuthor)

    const nextMinutes = body.minutesSpent ?? existing.minutesSpent
    validateMinutesInDomain(nextMinutes)
    const prevYmd = existing.workDate.toISOString().slice(0, 10)
    const nextYmd = body.workDate ?? prevYmd
    if (body.workDate !== undefined) {
      assertWorkDateYmdNotFuture(nextYmd)
    }
    let nextNote: string | null
    if (body.note === undefined) {
      nextNote = existing.note
    } else if (body.note === null) {
      nextNote = null
    } else {
      const t = body.note.trim()
      nextNote = t === "" ? null : t
    }
    if (nextNote && [...nextNote].length > 2000) {
      throw new WorkItemTimeEntriesValidationError("note must not exceed 2000 characters.")
    }
    const nextWorkDate = workDateYmdToUtcDate(nextYmd)
    const now = new Date()
    const prevSnap = snapshotForAudit(existing)
    const updated = await this.entriesRepo.update({
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      timeEntryPublicId,
      minutesSpent: nextMinutes,
      workDate: nextWorkDate,
      note: nextNote,
      updatedAt: now,
      updatedByUserPublicId: actor.userPublicId,
    })
    if (!updated) {
      throw new WorkItemTimeEntriesNotFoundError()
    }
    const nextSnap = snapshotForAudit(updated)
    const changed =
      prevSnap.minutesSpent !== nextSnap.minutesSpent ||
      prevSnap.workDateYmd !== nextSnap.workDateYmd ||
      prevSnap.note !== nextSnap.note
    if (changed && this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "time_entry",
        action: "time_entry_updated",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: prevSnap,
        nextValue: nextSnap,
      })
    }
    return updated
  }

  async deleteTimeEntry(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    timeEntryPublicId: string,
  ): Promise<void> {
    this.assertActorWorkspace(actor, workspacePublicId)
    assertCanReadTimeEntries(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const existing = await this.entriesRepo.findByIds(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      timeEntryPublicId,
    )
    if (!existing) {
      throw new WorkItemTimeEntriesNotFoundError()
    }
    const isAuthor = timeEntryIsAuthoredByActor(existing.createdByUserPublicId, actor)
    assertCanDeleteTimeEntry(actor, isAuthor)
    const now = new Date()
    const prevSnap = snapshotForAudit(existing)
    const ok = await this.entriesRepo.delete({
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      timeEntryPublicId,
    })
    if (!ok) {
      throw new WorkItemTimeEntriesNotFoundError()
    }
    if (this.auditLogRepository) {
      await this.auditLogRepository.append({
        workspacePublicId,
        category: "time_entry",
        action: "time_entry_deleted",
        actorUserPublicId: actor.userPublicId,
        occurredAt: now,
        resource: { projectPublicId, backlogItemPublicId },
        previousValue: prevSnap,
        /** Misma restricción que en create: `null` no persiste en Mixed requerido. */
        nextValue: { timeEntryDeleted: true },
      })
    }
  }
}
