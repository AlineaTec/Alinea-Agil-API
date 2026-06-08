import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach, afterEach } from "node:test"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { ProjectRuntimeInvalidInputError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { EmptySprint } from "../../daily-alignment/daily-alignment.in-memory.fixtures.js"
import { GuidedReviewService } from "./guided-review.service.js"
import {
  GuidedReviewConflictError,
  GuidedReviewForbiddenError,
  GuidedReviewNotFoundError,
  GuidedReviewUnsupportedError,
  GuidedReviewValidationError,
} from "../domain/guided-review.errors.js"
import { GUIDED_REVIEW_DEFAULT_SLOT, type GuidedReviewSessionState } from "../domain/guided-review-session.js"
import { resolveOperationalTimeZoneIana } from "../../daily-alignment/domain/operational-calendar.js"
import { ScrumBacklogForbiddenError } from "../../project-scrum-backlog/domain/scrum-backlog.errors.js"
import {
  backlogItem,
  GuidedReviewTestRuntime,
  MemBacklogPick,
  MemGuidedReviewDemonstratedItems,
  MemGuidedReviewFeedback,
  MemGuidedReviewSession,
  W,
  P,
} from "../guided-review.in-memory.fixtures.js"

const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const SLOT = GUIDED_REVIEW_DEFAULT_SLOT
const DATE = "2026-05-12"
const DATE_OLDER = "2026-05-10"

class MemAudit implements Pick<WorkspaceAuditLogRepository, "append"> {
  events: unknown[] = []
  async append(input: unknown): Promise<void> {
    this.events.push(input)
  }
}

class ActiveSprintRepo implements Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> {
  constructor(private readonly sprint: ScrumSprintState) {}
  async listSprintsByProject() {
    return [this.sprint]
  }
}

function sprintFixture(id: string): ScrumSprintState {
  const now = new Date()
  return {
    sprintPublicId: id,
    workspacePublicId: W,
    projectPublicId: P,
    name: "S1",
    goal: "Goal",
    status: "active",
    startDate: null,
    endDate: null,
    createdByUserPublicId: "u-seed",
    createdAt: now,
    updatedAt: now,
    closure: null,
    review: null,
    retrospective: null,
  }
}

/** Proyecto `predictive_phases`: lectura vía runtime materializado; escritura bloqueada. */
class PredictiveGuidedReviewRuntime
  implements
    Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState" | "requireScrumOrKanbanWorkspaceRuntimeProject">
{
  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== W || projectPublicId !== P) return null
    const now = new Date()
    return {
      projectPublicId: P,
      workspacePublicId: W,
      sourceDraftPublicId: randomUUID(),
      projectName: "T",
      operationalApproach: "predictive_phases" as const,
      initialConfigurationSummary: defaultInitialConfigurationSummary("predictive_phases"),
      status: "active" as const,
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  async requireScrumOrKanbanWorkspaceRuntimeProject() {
    throw new ProjectRuntimeInvalidInputError("Approach must be scrum or kanban.")
  }
}

function svcScrum(sprintRepo: ScrumSprintPlanningRepository = new EmptySprint() as unknown as ScrumSprintPlanningRepository) {
  const sessions = new MemGuidedReviewSession()
  const demos = new MemGuidedReviewDemonstratedItems()
  const feedback = new MemGuidedReviewFeedback()
  const backlog = new MemBacklogPick(new Map([[`${W}|${P}|${ITEM}`, backlogItem(ITEM)]]))
  return {
    svc: new GuidedReviewService(
      new GuidedReviewTestRuntime("scrum") as unknown as ProjectRuntimeService,
      sprintRepo,
      backlog,
      sessions,
      demos,
      feedback,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    ),
    sessions,
    demos,
    feedback,
    backlog,
  }
}

function svcKanban() {
  const sessions = new MemGuidedReviewSession()
  const demos = new MemGuidedReviewDemonstratedItems()
  const feedback = new MemGuidedReviewFeedback()
  const backlog = new MemBacklogPick(new Map([[`${W}|${P}|${ITEM}`, backlogItem(ITEM)]]))
  return {
    svc: new GuidedReviewService(
      new GuidedReviewTestRuntime("kanban") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      backlog,
      sessions,
      demos,
      feedback,
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    ),
    sessions,
  }
}

describe("guided-review.service", () => {
  const dev = minimalWorkspaceMember({
    workspacePublicId: W,
    userPublicId: "u-dev",
    workspaceRoleMethodological: "scrum_developer",
  })
  const sm = minimalWorkspaceMember({
    workspacePublicId: W,
    userPublicId: "u-sm",
    workspaceRoleMethodological: "scrum_master",
  })
  const po = minimalWorkspaceMember({
    workspacePublicId: W,
    userPublicId: "u-po",
    workspaceRoleMethodological: "product_owner",
  })

  it("lazy-creates session on first header upsert", async () => {
    const { svc, sessions } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewGoalSummary: "Review increment",
      reviewMode: "async",
    })
    assert.equal(sessions.sessions.size, 1)
  })

  it("unicidad: misma fecha distinto slot → dos sesiones", async () => {
    const { svc, sessions } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: "am" }, { reviewGoalSummary: "A" })
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: "pm" }, { reviewGoalSummary: "B" })
    assert.equal(sessions.sessions.size, 2)
  })

  it("lazy create absorbe carrera simulada: segundo insert con dup retorna sesión existente", async () => {
    const { svc, sessions } = svcScrum()
    const first = await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewGoalSummary: "One",
    })
    const injected = { ...first, reviewGoalSummary: "Injected" as const }
    await assert.rejects(() => sessions.insert(injected), (e: unknown) => (e as { code?: number }).code === 11000)
    const second = await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      reviewGoalSummary: "Two",
    })
    assert.equal(second.sessionPublicId, first.sessionPublicId)
    assert.equal(second.reviewGoalSummary, "Two")
  })

  it("registra ítem demostrado y actualiza contadores", async () => {
    const { svc, sessions } = svcScrum()
    await svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      demonstrationStatus: "demonstrated_with_observations",
      demoNotes: "Limits discussed",
      followUpRequired: true,
      backlogImpactSuggested: true,
    })
    const s = await sessions.findByKey(W, P, DATE, SLOT)
    assert.ok(s)
    assert.equal(s!.demonstratedItemCount, 1)
    assert.equal(s!.backlogImpactCount, 1)
  })

  it("feedback general sin work item: isGeneralFeedback true", async () => {
    const { svc } = svcScrum()
    const row = await svc.appendFeedbackForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      sourceType: "stakeholder",
      stakeholderDisplayName: "Cliente ACME",
      feedbackText: "Necesitamos reporte exportable",
      feedbackCategory: "value_and_outcome",
      marksFollowUp: true,
    })
    assert.equal(row.isGeneralFeedback, true)
    assert.deepEqual(row.affectsWorkItemPublicIds, [])
  })

  it("feedback vinculado a work item", async () => {
    const { svc } = svcScrum()
    const row = await svc.appendFeedbackForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      sourceType: "product_owner",
      feedbackText: "Ajustar copy en el paso 2",
      feedbackCategory: "usability_and_experience",
      affectsWorkItemPublicIds: [ITEM],
    })
    assert.equal(row.isGeneralFeedback, false)
    assert.deepEqual(row.affectsWorkItemPublicIds, [ITEM])
  })

  it("cierre por facilitador (SM)", async () => {
    const svc = new GuidedReviewService(
      new GuidedReviewTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemBacklogPick(new Map([[`${W}|${P}|${ITEM}`, backlogItem(ITEM)]])),
      new MemGuidedReviewSession(),
      new MemGuidedReviewDemonstratedItems(),
      new MemGuidedReviewFeedback(),
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    await svc.appendFeedbackForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      sourceType: "team",
      feedbackText: "ok",
      feedbackCategory: "other",
    })
    const closed = await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      generalSummary: "Done",
      agreements: ["A1"],
      followUps: ["F1"],
      sprintGoalAssessment: "achieved",
    })
    assert.equal(closed.status, "closed")
    assert.ok(closed.closedAt)
  })

  it("cierre sin decisiones útiles → closed_without_decisions", async () => {
    const { svc } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { reviewGoalSummary: "X" })
    const closed = await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
      sprintGoalAssessment: "unclear",
    })
    assert.equal(closed.status, "closed_without_decisions")
  })

  it("partially_achieved exige explicación", async () => {
    const { svc } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {})
    await assert.rejects(
      () =>
        svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
          agreements: [],
          followUps: [],
          sprintGoalAssessment: "partially_achieved",
          sprintGoalAssessmentExplanation: "   ",
        }),
      GuidedReviewValidationError,
    )
  })

  it("no reapertura: no editar demostración tras cierre", async () => {
    const { svc } = svcScrum()
    await svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      demonstrationStatus: "demonstrated",
    })
    await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
      sprintGoalAssessment: "achieved",
    })
    await assert.rejects(
      () =>
        svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
          demonstrationStatus: "demonstrated_with_observations",
        }),
      GuidedReviewConflictError,
    )
  })

  it("nota aditiva post-cierre", async () => {
    const { svc } = svcScrum()
    await svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      demonstrationStatus: "demonstrated",
    })
    await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
      sprintGoalAssessment: "achieved",
    })
    const after = await svc.appendAdditiveNoteAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "Acuerdo verbal adicional")
    assert.equal(after.additiveNotesAfterClose.length, 1)
    assert.equal(after.additiveNotesAfterClose[0]!.noteText, "Acuerdo verbal adicional")
  })

  it("transcripción post-cierre: sustituir y borrar con vacío", async () => {
    const { svc } = svcScrum()
    await svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      demonstrationStatus: "demonstrated",
    })
    await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
      sprintGoalAssessment: "achieved",
    })
    const t1 = await svc.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "Primera transcripción")
    assert.ok(t1.transcriptAfterClose)
    assert.equal(t1.transcriptAfterClose!.text, "Primera transcripción")
    const t2 = await svc.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "Segunda versión")
    assert.equal(t2.transcriptAfterClose!.text, "Segunda versión")
    const t3 = await svc.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "   ")
    assert.equal(t3.transcriptAfterClose, null)
  })

  it("transcripción post-cierre rechazada si la sesión sigue abierta", async () => {
    const { svc } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { reviewGoalSummary: "X" })
    await assert.rejects(
      () => svc.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "x"),
      GuidedReviewConflictError,
    )
  })

  it("historial reciente ordenado por fecha descendente", async () => {
    const sessions = new MemGuidedReviewSession()
    const now = new Date()
    const sNew: GuidedReviewSessionState = {
      sessionPublicId: randomUUID(),
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: DATE,
      sessionSlot: SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      reviewMode: "live",
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "closed",
      reviewGoalSummary: null,
      closeSummary: null,
      agreements: [],
      followUps: [],
      stakeholderSummary: null,
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: null,
      sprintGoalAssessment: "achieved",
      sprintGoalAssessmentExplanation: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 0,
      feedbackCount: 0,
      backlogImpactCount: 0,
      startedAt: now,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    }
    const sOld = { ...sNew, sessionPublicId: randomUUID(), sessionDate: DATE_OLDER }
    await sessions.insert(sOld)
    await sessions.insert(sNew)
    const svc = new GuidedReviewService(
      new GuidedReviewTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemBacklogPick(new Map()),
      sessions,
      new MemGuidedReviewDemonstratedItems(),
      new MemGuidedReviewFeedback(),
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const rows = await svc.listRecentSessions(dev, W, P, 10)
    assert.equal(rows[0]!.sessionDate, DATE)
    assert.equal(rows[1]!.sessionDate, DATE_OLDER)
  })

  it("última demostración por work item", async () => {
    const demos = new MemGuidedReviewDemonstratedItems()
    const sessions = new MemGuidedReviewSession()
    const now = new Date()
    const sidOld = randomUUID()
    const sidNew = randomUUID()
    const base = {
      workspacePublicId: W,
      projectPublicId: P,
      workItemPublicId: ITEM,
      demonstrationStatus: "demonstrated" as const,
      demonstratedByUserPublicIds: ["u-dev"],
      demoNotes: null,
      stakeholderFeedbackSummary: null,
      questionsRaised: [],
      followUpRequired: false,
      backlogImpactSuggested: false,
      priorityImpactSuggested: false,
      requiresFurtherValidation: false,
      reviewOutcome: null,
      createdAt: now,
      updatedAt: now,
    }
    await demos.upsert({
      ...base,
      demonstratedItemPublicId: randomUUID(),
      sessionPublicId: sidOld,
      sessionDate: DATE_OLDER,
    })
    await demos.upsert({
      ...base,
      demonstratedItemPublicId: randomUUID(),
      sessionPublicId: sidNew,
      sessionDate: DATE,
    })
    await sessions.insert({
      sessionPublicId: sidOld,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: DATE_OLDER,
      sessionSlot: SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      reviewMode: "live",
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "closed",
      reviewGoalSummary: null,
      closeSummary: null,
      agreements: [],
      followUps: [],
      stakeholderSummary: null,
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: null,
      sprintGoalAssessment: "achieved",
      sprintGoalAssessmentExplanation: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 1,
      feedbackCount: 0,
      backlogImpactCount: 0,
      startedAt: now,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await sessions.insert({
      sessionPublicId: sidNew,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: DATE,
      sessionSlot: SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      reviewMode: "live",
      facilitatorUserPublicId: null,
      productOwnerUserPublicId: null,
      status: "closed",
      reviewGoalSummary: null,
      closeSummary: null,
      agreements: [],
      followUps: [],
      stakeholderSummary: null,
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: null,
      sprintGoalAssessment: "achieved",
      sprintGoalAssessmentExplanation: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 1,
      feedbackCount: 0,
      backlogImpactCount: 0,
      startedAt: now,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const svc = new GuidedReviewService(
      new GuidedReviewTestRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemBacklogPick(new Map([[`${W}|${P}|${ITEM}`, backlogItem(ITEM)]])),
      sessions,
      demos,
      new MemGuidedReviewFeedback(),
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const r = await svc.getLatestDemonstrationForWorkItem(dev, W, P, ITEM)
    assert.equal(r.demonstratedItem?.sessionDate, DATE)
  })

  it("Scrum: lazy session enlaza sprint activo al crear", async () => {
    const spId = "33333333-3333-4333-8333-333333333333"
    const { svc, sessions } = svcScrum(new ActiveSprintRepo(sprintFixture(spId)) as unknown as ScrumSprintPlanningRepository)
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {})
    const s = await sessions.findByKey(W, P, DATE, SLOT)
    assert.equal(s!.sprintPublicId, spId)
  })

  it("Kanban: cierre sin sprint goal envía not_applicable", async () => {
    const { svc } = svcKanban()
    await svc.upsertDemonstratedItemForToday(dev, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
      demonstrationStatus: "demonstrated",
    })
    const closed = await svc.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
    })
    assert.equal(closed.sprintGoalAssessment, "not_applicable")
  })

  it("Predictive: lectura degradada; escritura unsupported", async () => {
    const sessions = new MemGuidedReviewSession()
    const svc = new GuidedReviewService(
      new PredictiveGuidedReviewRuntime() as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemBacklogPick(new Map([[`${W}|${P}|${ITEM}`, backlogItem(ITEM)]])),
      sessions,
      new MemGuidedReviewDemonstratedItems(),
      new MemGuidedReviewFeedback(),
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
    )
    const boot = await svc.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(boot.guidedReviewOperable, false)
    assert.equal(boot.session, null)
    await assert.rejects(
      () =>
        svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { reviewGoalSummary: "x" }),
      GuidedReviewUnsupportedError,
    )
  })

  describe("operational time zone env", () => {
    let prev: string | undefined
    beforeEach(() => {
      prev = process.env.WORKSPACE_OPERATIONAL_TIME_ZONE
      process.env.WORKSPACE_OPERATIONAL_TIME_ZONE = "America/Argentina/Buenos_Aires"
    })
    afterEach(() => {
      if (prev === undefined) delete process.env.WORKSPACE_OPERATIONAL_TIME_ZONE
      else process.env.WORKSPACE_OPERATIONAL_TIME_ZONE = prev
    })

    it("bootstrap expone TZ operativa resuelta", async () => {
      const { svc } = svcScrum()
      const boot = await svc.getTodayBootstrap(dev, W, P, {})
      assert.equal(boot.operationalTimeZone, resolveOperationalTimeZoneIana())
      assert.equal(resolveOperationalTimeZoneIana(), "America/Argentina/Buenos_Aires")
    })
  })

  it("slot inválido", async () => {
    const { svc } = svcScrum()
    await assert.rejects(
      () => svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: "BAD SLOT" }, {}),
      GuidedReviewValidationError,
    )
  })

  it("work item no encontrado", async () => {
    const { svc } = svcScrum()
    await assert.rejects(
      () =>
        svc.upsertDemonstratedItemForToday(dev, W, P, ITEM_B, { sessionDate: DATE, sessionSlot: SLOT }, {
          demonstrationStatus: "demonstrated",
        }),
      GuidedReviewNotFoundError,
    )
  })

  it("desarrollador no puede cerrar", async () => {
    const { svc } = svcScrum()
    await svc.upsertSessionHeader(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {})
    await assert.rejects(
      () =>
        svc.closeToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
          agreements: [],
          followUps: [],
          sprintGoalAssessment: "achieved",
        }),
      GuidedReviewForbiddenError,
    )
  })

  it("PO puede cerrar (facilitador autorizado)", async () => {
    const { svc } = svcScrum()
    await svc.appendFeedbackForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      sourceType: "team",
      feedbackText: "x",
      feedbackCategory: "other",
    })
    const closed = await svc.closeToday(po, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      followUps: [],
      sprintGoalAssessment: "compromised",
    })
    assert.equal(closed.status, "closed")
  })

  it("miembro sin rol de backlog no escribe contenido", async () => {
    const stranger = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-x",
      workspaceRoleMethodological: null,
      workspaceRoleAdministrative: null,
    })
    const { svc } = svcScrum()
    await assert.rejects(
      () =>
        svc.upsertDemonstratedItemForToday(stranger, W, P, ITEM, { sessionDate: DATE, sessionSlot: SLOT }, {
          demonstrationStatus: "demonstrated",
        }),
      ScrumBacklogForbiddenError,
    )
  })
})
