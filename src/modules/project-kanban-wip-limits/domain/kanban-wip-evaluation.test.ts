import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { getDefaultWipForKanbanColumnPosition } from "../../project-kanban-core/domain/kanban-flow-wip-defaults.js"
import type { KanbanColumnState, ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import {
  checkKanbanWipMove,
  computeWipColumnVisualState,
  makeWipColumnEvaluationForRead,
} from "./kanban-wip-evaluation.js"

const col = (partial: Partial<KanbanColumnState> & Pick<KanbanColumnState, "columnPublicId">): KanbanColumnState => ({
  name: "C",
  position: 0,
  policyText: "",
  wipLimit: null,
  wipEnforcement: "informational",
  ...partial,
})

const flowBase: ProjectKanbanFlowConfigState = {
  workspacePublicId: "w",
  projectPublicId: "p",
  entryColumnPublicId: "e",
  wipNearThresholdRatio: 0.8,
  columns: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("checkKanbanWipMove", () => {
  it("informational never blocks", () => {
    const c = col({ columnPublicId: "x", wipLimit: 1, wipEnforcement: "informational" })
    const r = checkKanbanWipMove(c, 2, false, null, false)
    assert.equal(r.outcome, "allow")
  })

  it("warning: no ack when under limit", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "warning" })
    assert.equal(checkKanbanWipMove(c, 1, false, null, false).outcome, "allow")
  })

  it("warning: need ack when projected >= limit", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "warning" })
    assert.equal(checkKanbanWipMove(c, 2, false, null, false).outcome, "need_ack")
    assert.equal(checkKanbanWipMove(c, 2, true, null, false).outcome, "allow")
  })

  it("blocking: allow when projected <= limit", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "blocking" })
    assert.equal(checkKanbanWipMove(c, 2, false, null, false).outcome, "allow")
  })

  it("blocking: wip_blocked without reason when would exceed", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "blocking" })
    const r = checkKanbanWipMove(c, 3, false, null, true)
    assert.equal(r.outcome, "wip_blocked")
  })

  it("blocking: override_forbidden with reason but role disallowed", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "blocking" })
    const r = checkKanbanWipMove(c, 3, false, "capacity", false)
    assert.equal(r.outcome, "override_forbidden")
  })

  it("blocking: allow with reason and override role", () => {
    const c = col({ columnPublicId: "x", wipLimit: 3, wipEnforcement: "blocking" })
    assert.equal(checkKanbanWipMove(c, 3, false, "ok", true).outcome, "allow")
  })
})

describe("computeWipColumnVisualState", () => {
  it("none without limit", () => {
    assert.equal(computeWipColumnVisualState(0, null, 0.8), "none")
  })

  it("near at 0.8 ratio (strictly below at_limit)", () => {
    assert.equal(computeWipColumnVisualState(4, 5, 0.8), "near")
  })

  it("at_limit and exceeded", () => {
    assert.equal(computeWipColumnVisualState(3, 3, 0.8), "at_limit")
    assert.equal(computeWipColumnVisualState(4, 3, 0.8), "exceeded")
  })
})

describe("getDefaultWipForKanbanColumnPosition", () => {
  it("v1 four-column defaults", () => {
    assert.deepEqual(getDefaultWipForKanbanColumnPosition(0), { wipLimit: null, wipEnforcement: "informational" })
    assert.deepEqual(getDefaultWipForKanbanColumnPosition(1), { wipLimit: 3, wipEnforcement: "blocking" })
    assert.deepEqual(getDefaultWipForKanbanColumnPosition(2), { wipLimit: 1, wipEnforcement: "blocking" })
    assert.deepEqual(getDefaultWipForKanbanColumnPosition(3), { wipLimit: null, wipEnforcement: "informational" })
  })
})

describe("makeWipColumnEvaluationForRead", () => {
  it("exposes next-add flags for warning", () => {
    const c = col({ columnPublicId: "c", position: 1, wipLimit: 2, wipEnforcement: "warning" })
    const f = { ...flowBase, columns: [c] }
    const e = makeWipColumnEvaluationForRead(c, 1, f)
    assert.equal(e.state, "normal")
    assert.equal(e.requiresConfirmationForNextAdd, true)
  })
})
