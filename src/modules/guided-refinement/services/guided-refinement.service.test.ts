import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { GuidedRefinementService } from "./guided-refinement.service.js"
import {
  GuidedRefinementConflictError,
  GuidedRefinementForbiddenError,
  GuidedRefinementUnsupportedError,
  GuidedRefinementValidationError,
} from "../domain/guided-refinement.errors.js"
import { GUIDED_REFINEMENT_DEFAULT_SLOT } from "../domain/guided-refinement-session.js"
import {
  backlogItemFixture,
  GuidedTestRuntime,
  MemBacklog,
  MemGuidedReviewedItems,
  MemGuidedSession,
  P,
  W,
} from "../guided-refinement.in-memory.fixtures.js"
import { EmptySprint } from "../../daily-alignment/daily-alignment.in-memory.fixtures.js"

const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const SLOT = GUIDED_REFINEMENT_DEFAULT_SLOT
const DATE = "2026-05-12"

class MemAudit implements Pick<WorkspaceAuditLogRepository, "append"> {
  events: unknown[] = []
  async append(input: unknown): Promise<void> {
    this.events.push(input)
  }
}

describe("guided-refinement.service", () => {
  it("lazy-creates session on first item review (scrum)", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const audit = new MemAudit()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      audit as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: false,
    })
    assert.equal(sessions.sessions.size, 1)
  })

  it("reviewed sin ready: mantiene semántica OQ-GRF-19", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const audit = new MemAudit()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      audit as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const r = await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: false,
      notReadyReasons: ["insufficient_clarity"],
    })
    assert.equal(r.reviewStatus, "reviewed")
    assert.equal(r.readyForPlanning, false)
  })

  it("listo sin reviewed es inválido", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () =>
        svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
          reviewStatus: "in_review",
          readyForPlanning: true,
        }),
      GuidedRefinementValidationError,
    )
  })

  it("consensus_pending anula readyForPlanning", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const r = await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: true,
      notReadyReasons: ["consensus_pending"],
    })
    assert.equal(r.readyForPlanning, false)
  })

  it("no reapertura: no se edita ítem tras cierre", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("kanban") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
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
    await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: false,
    })
    await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      generalSummary: "ok",
      agreements: [],
      followUps: [],
    })
    await assert.rejects(
      () =>
        svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
          reviewStatus: "reviewed",
          readyForPlanning: true,
        }),
      GuidedRefinementConflictError,
    )
  })

  it("cierre sin revisiones → closed_without_decisions", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const sm = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-sm",
      workspaceRoleMethodological: "scrum_master",
    })
    const closed = await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      generalSummary: "",
      agreements: [],
      followUps: [],
    })
    assert.equal(closed.status, "closed_without_decisions")
  })

  it("PO puede cerrar sesión", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const po = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-po",
      workspaceRoleMethodological: "product_owner",
    })
    const closed = await svc.closeToday(po, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      generalSummary: "x",
      agreements: [],
      followUps: [],
    })
    assert.equal(closed.status, "closed_without_decisions")
  })

  it("developer no cierra", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map())
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () =>
        svc.closeToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
          generalSummary: "x",
          agreements: [],
          followUps: [],
        }),
      GuidedRefinementForbiddenError,
    )
  })

  it("predictive: bootstrap sin sesión y recent vacío", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map())
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("predictive_phases") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const b = await svc.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(b.supportLevel, "unsupported")
    assert.equal(b.session, null)
    const recent = await svc.listRecentSessions(dev, W, P, 10)
    assert.deepEqual(recent, [])
  })

  it("predictive: mutación no permitida", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("predictive_phases") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () =>
        svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { focusSummary: "hi" }),
      GuidedRefinementUnsupportedError,
    )
  })

  it("nota aditiva tras cierre", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const sm = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-sm",
      workspaceRoleMethodological: "scrum_master",
    })
    await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      generalSummary: "c",
      agreements: [],
      followUps: [],
    })
    const next = await svc.appendAdditiveNoteAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "n1")
    assert.deepEqual(next.additiveNotesAfterClose, ["n1"])
  })

  it("última revisión por ítem: sesión más reciente gana", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: "2026-05-01", sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: true,
    })
    await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: "2026-05-10", sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: false,
    })
    const latest = await svc.getLatestReviewForWorkItem(dev, W, P, ITEM)
    assert(latest.review)
    assert.equal(latest.supportLevel, "full")
    assert.equal(latest.guidedRefinementOperable, true)
    assert.equal(latest.operationalApproach, "scrum")
    assert.equal(latest.review.sessionDate, "2026-05-10")
    assert.equal(latest.review.readyForPlanning, false)
  })

  it("contadores de sesión separan candidatos pendientes y revisados no listos", async () => {
    const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    const sessions = new MemGuidedSession()
    const reviewed = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(
      new Map([
        [`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)],
        [`${W}|${P}|${ITEM_B}`, backlogItemFixture(ITEM_B)],
      ]),
    )
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      reviewed,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      candidateWorkItemPublicIds: [ITEM, ITEM_B],
    })
    await svc.upsertReviewedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewStatus: "reviewed",
      readyForPlanning: false,
    })
    const boot = await svc.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert(boot.session)
    assert.equal(boot.session.pendingCandidateReviewCount, 1)
    assert.equal(boot.session.reviewedNotReadyCount, 1)
  })

  it("latest-review en predictive: operable false y mismo supportLevel que today", async () => {
    const sessions = new MemGuidedSession()
    const items = new MemGuidedReviewedItems()
    const backlog = new MemBacklog(new Map([[`${W}|${P}|${ITEM}`, backlogItemFixture(ITEM)]]))
    const svc = new GuidedRefinementService(
      new GuidedTestRuntime("predictive_phases") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      items,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const reader = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-admin",
      workspaceRoleAdministrative: "admin",
    })
    const latest = await svc.getLatestReviewForWorkItem(reader, W, P, ITEM)
    assert.equal(latest.supportLevel, "unsupported")
    assert.equal(latest.guidedRefinementOperable, false)
    assert.equal(latest.operationalApproach, "predictive_phases")
    assert.equal(latest.review, null)
  })
})
