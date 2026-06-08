import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { KANBAN_DEFAULT_COLUMN_NAMES } from "./kanban-flow.constants.js"
import { buildDefaultKanbanFlowTemplate } from "./kanban-flow-template.js"

describe("buildDefaultKanbanFlowTemplate", () => {
  it("materializes four columns in order without Backlog", () => {
    const tpl = buildDefaultKanbanFlowTemplate()
    assert.equal(tpl.columns.length, 4)
    const names = tpl.columns.map((c) => c.name)
    assert.deepEqual(names, [...KANBAN_DEFAULT_COLUMN_NAMES])
    assert.ok(!names.some((n) => /backlog/i.test(n)))
    for (let i = 0; i < tpl.columns.length; i++) {
      assert.equal(tpl.columns[i]?.position, i)
      assert.ok(tpl.columns[i]?.columnPublicId.length > 0)
      if (i === 1) assert.equal(tpl.columns[i]?.wipLimit, 3)
      else if (i === 2) assert.equal(tpl.columns[i]?.wipLimit, 1)
      else assert.equal(tpl.columns[i]?.wipLimit, null)
      if (i === 0 || i === 3) assert.equal(tpl.columns[i]?.wipEnforcement, "informational")
      if (i === 1 || i === 2) assert.equal(tpl.columns[i]?.wipEnforcement, "blocking")
      assert.equal(tpl.columns[i]?.policyText, "")
    }
  })

  it("sets entryColumnId to Ready (first column)", () => {
    const tpl = buildDefaultKanbanFlowTemplate()
    const ready = tpl.columns[0]
    assert.ok(ready)
    assert.equal(ready.name, "Ready")
    assert.equal(tpl.entryColumnPublicId, ready.columnPublicId)
  })
})
