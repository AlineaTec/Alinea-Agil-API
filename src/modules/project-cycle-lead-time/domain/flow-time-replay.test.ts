import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { WorkspaceAuditLogListRow } from "../../workspace-audit-log/domain/workspace-audit-log-list-row.js"
import type { FlowTimeSemanticColumnIds } from "./flow-time-column-roles.js"
import {
  lastCompletionInWindow,
  readFromColumnPublicId,
  replayCompletionsForItem,
} from "./flow-time-replay.js"

const itemId = "00000000-0000-4000-8000-0000000000d0"
const colReady = "00000000-0000-4000-8000-0000000000a1"
const colDoing = "00000000-0000-4000-8000-0000000000b2"
const colDone = "00000000-0000-4000-8000-0000000000c3"

const semantic: FlowTimeSemanticColumnIds = {
  flowEntryColumnPublicId: colReady,
  executionStartColumnPublicId: colDoing,
  terminalColumnPublicId: colDone,
}

function ev(
  action: "released_to_flow" | "returned_to_backlog" | "moved_between_columns",
  at: string,
  next: unknown,
  prev: unknown = null,
): WorkspaceAuditLogListRow {
  return {
    auditEventPublicId: randomUUID(),
    workspacePublicId: "w",
    category: action === "moved_between_columns" ? "kanban_board_item" : "kanban_backlog_item",
    action: action === "moved_between_columns" ? "moved_between_columns" : action,
    occurredAt: new Date(at),
    resourceProjectPublicId: "p",
    resourceBacklogItemPublicId: itemId,
    previousValue: prev,
    nextValue: next,
  }
}

describe("flow-time-replay", () => {
  it("readFromColumnPublicId lee fromColumn del audit", () => {
    assert.equal(
      readFromColumnPublicId({ fromColumnPublicId: colReady, toColumnPublicId: colDoing }),
      colReady,
    )
  })

  it("lead y cycle: release -> In Progress -> Done", () => {
    const evs: WorkspaceAuditLogListRow[] = [
      ev("released_to_flow", "2026-01-01T10:00:00.000Z", { kanbanColumnPublicId: colReady }),
      ev("moved_between_columns", "2026-01-01T12:00:00.000Z", { toColumnPublicId: colDoing }, {
        fromColumnPublicId: colReady,
        toColumnPublicId: colDoing,
      }),
      ev("moved_between_columns", "2026-01-05T10:00:00.000Z", { toColumnPublicId: colDone }, {
        fromColumnPublicId: colDoing,
        toColumnPublicId: colDone,
      }),
    ]
    const all = replayCompletionsForItem(itemId, evs, semantic)
    assert.equal(all.length, 1)
    assert.equal(all[0]!.doneAt.toISOString(), "2026-01-05T10:00:00.000Z")
    assert.equal(all[0]!.leadStartedAt.toISOString(), "2026-01-01T10:00:00.000Z")
    assert.equal(all[0]!.cycleStartedAt?.toISOString(), "2026-01-01T12:00:00.000Z")
  })

  it("cycle null si nunca pasa por execution", () => {
    const evs: WorkspaceAuditLogListRow[] = [
      ev("released_to_flow", "2026-01-01T10:00:00.000Z", { kanbanColumnPublicId: colReady }),
      ev("moved_between_columns", "2026-01-03T10:00:00.000Z", { toColumnPublicId: colDone }, {
        fromColumnPublicId: colReady,
        toColumnPublicId: colDone,
      }),
    ]
    const all = replayCompletionsForItem(itemId, evs, semantic)
    assert.equal(all.length, 1)
    assert.equal(all[0]!.cycleStartedAt, null)
  })

  it("última finalización en ventana [from, to)", () => {
    const all = [
      {
        backlogItemPublicId: itemId,
        doneAt: new Date("2026-01-10T00:00:00.000Z"),
        leadStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        cycleStartedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        backlogItemPublicId: itemId,
        doneAt: new Date("2026-02-10T00:00:00.000Z"),
        leadStartedAt: new Date("2026-02-01T00:00:00.000Z"),
        cycleStartedAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ]
    const from = new Date("2026-01-15T00:00:00.000Z")
    const to = new Date("2026-02-20T00:00:00.000Z")
    const one = lastCompletionInWindow(all, from, to)
    assert.equal(one?.doneAt.toISOString(), "2026-02-10T00:00:00.000Z")
  })

  it("to exclusivo: doneAt en el límite to no entra", () => {
    const all = [
      {
        backlogItemPublicId: itemId,
        doneAt: new Date("2026-01-20T00:00:00.000Z"),
        leadStartedAt: new Date("2026-01-01T00:00:00.000Z"),
        cycleStartedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]
    const from = new Date("2026-01-01T00:00:00.000Z")
    const to = new Date("2026-01-20T00:00:00.000Z")
    const one = lastCompletionInWindow(all, from, to)
    assert.equal(one, null)
  })

  it("from inclusivo: doneAt justo en from entra", () => {
    const doneAt = new Date("2026-01-15T00:00:00.000Z")
    const all = [
      {
        backlogItemPublicId: itemId,
        doneAt,
        leadStartedAt: new Date("2026-01-10T00:00:00.000Z"),
        cycleStartedAt: new Date("2026-01-11T00:00:00.000Z"),
      },
    ]
    const one = lastCompletionInWindow(all, doneAt, new Date("2026-01-16T00:00:00.000Z"))
    assert.equal(one?.doneAt.getTime(), doneAt.getTime())
  })
})
