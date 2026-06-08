import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkItemTimeEntriesRepository } from "../../work-item-time-logging/persistence/work-item-time-entries.repository.js"
import {
  buildSuggestionBasisAndHints,
  DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS,
  DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES,
} from "./daily-alignment-suggestion-context.js"

class MemTime implements Pick<WorkItemTimeEntriesRepository, "sumMinutesForUserProjectWorkDateRange"> {
  constructor(private readonly minutes: number) {}
  async sumMinutesForUserProjectWorkDateRange(): Promise<number> {
    return this.minutes
  }
}

class MemAudit implements Pick<WorkspaceAuditLogRepository, "countForProjectUserInWindow"> {
  constructor(private readonly count: number) {}
  async countForProjectUserInWindow(): Promise<number> {
    return this.count
  }
}

describe("daily-alignment-suggestion-context", () => {
  const baseInput = {
    workspacePublicId: "w",
    projectPublicId: "p",
    userPublicId: "u",
    sessionYmd: "2026-05-11",
    operationalTimeZone: "UTC",
    referenceYmd: "2026-05-08",
    yesterdaySummary: "",
  }

  it(`marks insufficient below ${DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES} minutes and below ${DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS} events`, async () => {
    const { basis, hints } = await buildSuggestionBasisAndHints({
      ...baseInput,
      timeEntriesRepository: new MemTime(DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES - 1) as unknown as WorkItemTimeEntriesRepository,
      auditLogRepository: new MemAudit(DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS - 1) as unknown as WorkspaceAuditLogRepository,
    })
    assert.equal(basis.insufficientData, true)
    assert.ok(hints.some((h) => h.kind === "insufficient_observable_activity"))
  })

  it(`sufficient with exactly ${DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES} minutes logged`, async () => {
    const { basis, hints } = await buildSuggestionBasisAndHints({
      ...baseInput,
      yesterdaySummary: "Short",
      timeEntriesRepository: new MemTime(DAILY_ALIGNMENT_SUGGESTION_MIN_MINUTES) as unknown as WorkItemTimeEntriesRepository,
      auditLogRepository: new MemAudit(0) as unknown as WorkspaceAuditLogRepository,
    })
    assert.equal(basis.insufficientData, false)
    assert.ok(
      hints.some((h) => h.kind === "activity_support_for_review"),
      "expects orientative hint when summary is still thin but data exists",
    )
  })

  it(`sufficient with exactly ${DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS} audit events`, async () => {
    const { basis } = await buildSuggestionBasisAndHints({
      ...baseInput,
      timeEntriesRepository: new MemTime(0) as unknown as WorkItemTimeEntriesRepository,
      auditLogRepository: new MemAudit(DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS) as unknown as WorkspaceAuditLogRepository,
    })
    assert.equal(basis.insufficientData, false)
    assert.equal(basis.relevantAuditEventCount, DAILY_ALIGNMENT_SUGGESTION_MIN_EVENTS)
  })

  it("adds non-punitive hint when user wrote yesterday text but logs are thin", async () => {
    const { hints } = await buildSuggestionBasisAndHints({
      ...baseInput,
      yesterdaySummary: "This is a longer declared summary.",
      timeEntriesRepository: new MemTime(0) as unknown as WorkItemTimeEntriesRepository,
      auditLogRepository: new MemAudit(0) as unknown as WorkspaceAuditLogRepository,
    })
    assert.ok(hints.some((h) => h.kind === "declared_without_recent_logs"))
  })
})
