import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { ImpedimentState } from "../../project-impediments/domain/impediment.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import { buildDefaultV1Criteria } from "./work-ready-done-build-default-criteria.js"
import { evaluateWorkControls } from "./work-ready-done-criteria.evaluator.js"

function baseItem(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: randomUUID(),
    workspacePublicId: "w",
    projectPublicId: "p",
    itemType: "user_story",
    title: "Title",
    description: "D",
    status: "in_progress",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: "u",
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: "assignee",
    assignmentUpdatedAt: now,
    assignmentUpdatedByUserPublicId: "u",
    assignmentHistory: [],
    storyPoints: 3,
    priorityLevel: "p2",
    acceptanceCriteria: [
      {
        acceptanceCriterionPublicId: randomUUID(),
        text: "x",
        status: "done",
        createdAt: now,
        updatedAt: now,
      },
    ],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
    ...over,
  }
}

describe("evaluateWorkControls", () => {
  it("ready_start_execution: missing assignee is warning, can continue", () => {
    const item = baseItem({ assignedUserPublicId: null })
    const r = evaluateWorkControls(
      "ready_start_execution",
      item,
      "scrum",
      buildDefaultV1Criteria(),
      [],
    )
    assert.equal(r.canContinue, true)
    assert.equal(r.requiresAcknowledgment, true)
    const assignee = r.criteria.find((c) => c.ruleId === "dor_assignee_present")
    assert(assignee)
    assert.equal(assignee!.pass, false)
  })

  it("ready_start_execution: critical impediment blocks", () => {
    const item = baseItem()
    const now = new Date()
    const imp: ImpedimentState = {
      impedimentPublicId: randomUUID(),
      workspacePublicId: "w",
      projectPublicId: "p",
      relatedWorkItemPublicId: item.backlogItemPublicId,
      relatedSprintPublicId: null,
      title: "t",
      description: "d",
      status: "open",
      severity: "critical",
      responsibleUserPublicId: null,
      reportedByUserPublicId: "u",
      detectedAt: now,
      resolvedAt: null,
      dismissedAt: null,
      resolutionSummary: null,
      dismissalReason: null,
      createdAt: now,
      updatedAt: now,
    }
    const r = evaluateWorkControls("ready_start_execution", item, "scrum", buildDefaultV1Criteria(), [imp])
    assert.equal(r.canContinue, false)
    assert(r.failedBlockingRuleIds.includes("dor_no_open_critical_impediment"))
  })

  it("done_close_item: not all AC done blocks (default)", () => {
    const now = new Date()
    const item = baseItem({
      acceptanceCriteria: [
        {
          acceptanceCriterionPublicId: randomUUID(),
          text: "x",
          status: "pending",
          createdAt: now,
          updatedAt: now,
        },
      ],
    })
    const r = evaluateWorkControls("done_close_item", item, "scrum", buildDefaultV1Criteria(), [])
    assert.equal(r.canContinue, false)
    assert(r.canResolveWithOverride)
  })
})
