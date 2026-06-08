import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { SprintPlanningService } from "../../project-scrum-sprint-planning/services/sprint-planning.service.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { GuidedSprintPlanningService } from "./guided-sprint-planning.service.js"
import {
  GuidedSprintPlanningConflictError,
  GuidedSprintPlanningForbiddenError,
  GuidedSprintPlanningUnsupportedError,
  GuidedSprintPlanningValidationError,
} from "../domain/guided-sprint-planning.errors.js"
import { GUIDED_SPRINT_PLANNING_DEFAULT_SLOT } from "../domain/guided-sprint-planning-session.js"
import {
  backlogItemFixture,
  DATE,
  GspTestRuntime,
  ITEM,
  ITEM2,
  MemBacklog,
  MemGspBaseline,
  MemGspCandidates,
  MemGspSession,
  MemRefinementReviews,
  MemSprintRepo,
  P,
  SPRINT,
  W,
} from "../guided-sprint-planning.in-memory.fixtures.js"

class MemAudit implements Pick<WorkspaceAuditLogRepository, "append"> {
  events: unknown[] = []
  async append(input: unknown): Promise<void> {
    this.events.push(input)
  }
}

function buildService(approach: "scrum" | "kanban" | "predictive_phases" = "scrum") {
  const runtime = new GspTestRuntime(approach)
  const sprintRepo = new MemSprintRepo()
  const backlog = new MemBacklog(
    new Map([
      [`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)],
      [`${W}|${P}|${ITEM2}`, backlogItemFixture(ITEM2)],
    ]),
  )
  const sessions = new MemGspSession()
  const candidates = new MemGspCandidates()
  const baselines = new MemGspBaseline()
  const refinement = new MemRefinementReviews()
  const audit = new MemAudit()
  const sprintPlanningService = new SprintPlanningService(
    sprintRepo as unknown as ScrumSprintPlanningRepository,
    backlog as unknown as import("../../project-scrum-backlog/persistence/scrum-backlog.repository.js").ScrumBacklogRepository,
    runtime as unknown as ProjectRuntimeService,
    null,
    null,
  )
  const svc = new GuidedSprintPlanningService(
    runtime as unknown as ProjectRuntimeService,
    sprintRepo as unknown as ScrumSprintPlanningRepository,
    backlog as unknown as import("../../project-scrum-backlog/persistence/scrum-backlog.repository.js").ScrumBacklogRepository,
    sprintPlanningService,
    refinement,
    sessions,
    candidates,
    baselines,
    audit as unknown as WorkspaceAuditLogRepository,
  )
  return { svc, sessions, candidates, baselines, sprintRepo, audit, refinement, backlog }
}

const sm = minimalWorkspaceMember({
  workspacePublicId: W,
  userPublicId: "u-sm",
  workspaceRoleMethodological: "scrum_master",
})

const dev = minimalWorkspaceMember({
  workspacePublicId: W,
  userPublicId: "u-dev",
  workspaceRoleMethodological: "scrum_developer",
})

const query = { sprintPublicId: SPRINT, sessionDate: DATE, sessionSlot: GUIDED_SPRINT_PLANNING_DEFAULT_SLOT }

describe("guided-sprint-planning.service", () => {
  it("lazy-creates session on header upsert (scrum)", async () => {
    const { svc, sessions } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, { planningGoalDraft: "Goal draft" })
    assert.equal(sessions.sessions.size, 1)
    const row = [...sessions.sessions.values()][0]!
    assert.equal(row.sprintPublicId, SPRINT)
    assert.equal(row.planningGoalDraft, "Goal draft")
  })

  it("enforces one session per sprint (idempotent lazy)", async () => {
    const { svc, sessions } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, { planningGoalDraft: "A" })
    await svc.upsertSessionHeader(sm, W, P, query, { planningGoalDraft: "B" })
    assert.equal(sessions.sessions.size, 1)
  })

  it("predictive approach is unsupported for mutations", async () => {
    const { svc } = buildService("predictive_phases")
    await assert.rejects(
      () => svc.upsertSessionHeader(sm, W, P, query, {}),
      GuidedSprintPlanningUnsupportedError,
    )
  })

  it("predictive bootstrap returns non-operable", async () => {
    const { svc } = buildService("predictive_phases")
    const b = await svc.getCurrentBootstrap(sm, W, P, query)
    assert.equal(b.guidedSprintPlanningOperable, false)
    assert.equal(b.session, null)
  })

  it("kanban uses flow key without sprint", async () => {
    const { svc, sessions } = buildService("kanban")
    const q = { sessionDate: DATE, sessionSlot: GUIDED_SPRINT_PLANNING_DEFAULT_SLOT }
    await svc.upsertSessionHeader(sm, W, P, q, { planningGoalDraft: "Flow goal" })
    assert.equal(sessions.sessions.size, 1)
    const row = [...sessions.sessions.values()][0]!
    assert.equal(row.sprintPublicId, null)
    assert.equal(row.planningMode, "flow_commitment_window")
  })

  it("sync seeds ready items from refinement", async () => {
    const { svc, refinement, candidates } = buildService("scrum")
    const now = new Date()
    refinement.reviews.push({
      reviewedItemPublicId: "r1",
      sessionPublicId: "s-ref",
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: DATE,
      workItemPublicId: ITEM,
      reviewStatus: "reviewed",
      readyForPlanning: true,
      readyWithObservations: false,
      observations: null,
      businessClarifications: null,
      technicalQuestions: null,
      dependenciesText: null,
      risksText: null,
      estimationStatus: "estimated",
      sizeConcern: "none",
      notReadyReasons: [],
      followUpRequired: false,
      reviewedByUserPublicIds: ["u-po"],
      createdAt: now,
      updatedAt: now,
    })
    const result = await svc.syncCandidateItems(dev, W, P, query)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0]!.isReadyForPlanning, true)
    assert.equal(candidates.items.size, 1)
  })

  it("sync includes reviewed items even when not marked ready for planning", async () => {
    const { svc, refinement } = buildService("scrum")
    const now = new Date()
    refinement.reviews.push({
      reviewedItemPublicId: "r2",
      sessionPublicId: "s-ref",
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: DATE,
      workItemPublicId: ITEM,
      reviewStatus: "reviewed",
      readyForPlanning: false,
      readyWithObservations: false,
      observations: null,
      businessClarifications: null,
      technicalQuestions: null,
      dependenciesText: null,
      risksText: null,
      estimationStatus: "estimated",
      sizeConcern: "none",
      notReadyReasons: ["consensus_pending"],
      followUpRequired: false,
      reviewedByUserPublicIds: ["u-po"],
      createdAt: now,
      updatedAt: now,
    })
    const result = await svc.syncCandidateItems(dev, W, P, query)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0]!.isReadyForPlanning, false)
  })

  it("all_open_backlog imports every open planifiable item without refinement review", async () => {
    const { svc, backlog } = buildService("scrum")
    const epicId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    backlog.map.set(`${W}|${P}|${epicId}`, {
      ...backlogItemFixture(epicId),
      itemType: "epic",
      title: "Epic A",
    })
    const result = await svc.syncCandidateItems(dev, W, P, query, "all_open_backlog")
    assert.equal(result.items.length, 3)
    assert.ok(result.items.some((i) => i.workItemPublicId === epicId))
  })

  it("all_open_backlog skips done items", async () => {
    const { svc, backlog } = buildService("scrum")
    backlog.map.set(`${W}|${P}|${ITEM}`, {
      ...backlogItemFixture(ITEM),
      status: "done",
    })
    const result = await svc.syncCandidateItems(dev, W, P, query, "all_open_backlog")
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0]!.workItemPublicId, ITEM2)
  })

  it("marks commit and exclude with validation", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertCandidateDecision(dev, W, P, ITEM, query, { isCommitted: true })
    const committed = await svc.getCandidateDecision(dev, W, P, ITEM, query)
    assert.equal(committed.item?.isCommitted, true)

    await assert.rejects(
      () => svc.upsertCandidateDecision(dev, W, P, ITEM2, query, { isExcluded: true }),
      GuidedSprintPlanningValidationError,
    )

    await svc.upsertCandidateDecision(dev, W, P, ITEM2, query, {
      isExcluded: true,
      excludedReason: "capacity",
    })
    const excluded = await svc.getCandidateDecision(dev, W, P, ITEM2, query)
    assert.equal(excluded.item?.isExcluded, true)
    assert.equal(excluded.item?.excludedReason, "capacity")
  })

  it("closes with warnings when data incomplete", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    const closed = await svc.closeCurrent(sm, W, P, query, {
      summary: "Closed thin",
      agreements: [],
      followUps: [],
    })
    assert.equal(closed.session.status, "closed_without_baseline")
    assert.ok(closed.session.planningWarnings.includes("missing_sprint_goal_final"))
    assert.ok(closed.session.planningWarnings.includes("missing_capacity"))
    assert.equal(closed.baseline, null)
  })

  it("creates baseline and applies commitment atomically on close", async () => {
    const { svc, sprintRepo } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {
      capacityTotal: 20,
      capacityUnit: "story_points",
      bufferReserved: 3,
    })
    await svc.upsertCandidateDecision(dev, W, P, ITEM, query, { isCommitted: true })
    const closed = await svc.closeCurrent(sm, W, P, query, {
      sprintGoalFinal: "Deliver X",
      summary: "Healthy close",
      agreements: ["A1"],
      followUps: [],
    })
    assert.ok(closed.baseline)
    assert.equal(closed.baseline!.committedWorkItemPublicIds.length, 1)
    assert.equal(closed.session.baselineCreated, true)
    const membership = await sprintRepo.findMembership(W, P, SPRINT, ITEM)
    assert.ok(membership)
  })

  it("does not reopen closed session", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    await svc.closeCurrent(sm, W, P, query, { summary: "done", agreements: [], followUps: [] })
    await assert.rejects(
      () => svc.upsertSessionHeader(sm, W, P, query, { planningGoalDraft: "nope" }),
      GuidedSprintPlanningConflictError,
    )
  })

  it("allows additive note after close by facilitator", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    await svc.closeCurrent(sm, W, P, query, { summary: "done", agreements: [], followUps: [] })
    const updated = await svc.appendAdditiveNoteAfterClose(sm, W, P, query, "Post note")
    assert.equal(updated.additiveNotesAfterClose.length, 1)
  })

  it("stores transcript on close and allows upsert after close", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    const closed = await svc.closeCurrent(sm, W, P, query, {
      summary: "done",
      agreements: [],
      followUps: [],
      transcript: "  Transcripción desde Teams  ",
    })
    assert.ok(closed.session.transcriptAfterClose)
    assert.equal(closed.session.transcriptAfterClose!.text, "Transcripción desde Teams")

    const t2 = await svc.upsertTranscriptAfterClose(sm, W, P, query, "Versión editada")
    assert.equal(t2.transcriptAfterClose!.text, "Versión editada")

    const t3 = await svc.upsertTranscriptAfterClose(sm, W, P, query, "   ")
    assert.equal(t3.transcriptAfterClose, null)
  })

  it("developer cannot close session", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    await assert.rejects(
      () => svc.closeCurrent(dev, W, P, query, { summary: "x", agreements: [], followUps: [] }),
      GuidedSprintPlanningForbiddenError,
    )
  })

  it("lists recent sessions", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertSessionHeader(sm, W, P, query, {})
    const recent = await svc.listRecentSessions(sm, W, P, 10)
    assert.equal(recent.length, 1)
  })

  it("gets baseline by sprint", async () => {
    const { svc } = buildService("scrum")
    await svc.upsertCandidateDecision(dev, W, P, ITEM, query, { isCommitted: true })
    await svc.closeCurrent(sm, W, P, query, {
      sprintGoalFinal: "G",
      summary: "s",
      agreements: [],
      followUps: [],
    })
    const baseline = await svc.getBaselineForSprint(sm, W, P, SPRINT)
    assert.ok(baseline)
  })
})
