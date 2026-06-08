/**
 * Integración PostgreSQL — dominio Scrum/Kanban operativo (Fase 4).
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { GuidedSprintPlanningBaselinePrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-baseline.prisma-repository.js"
import { GuidedSprintPlanningCandidateItemPrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-candidate-item.prisma-repository.js"
import { GuidedSprintPlanningSessionPrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-session.prisma-repository.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { buildDefaultKanbanFlowTemplate } from "../../modules/project-kanban-core/domain/kanban-flow-template.js"
import { KanbanFlowPrismaRepository } from "../../modules/project-kanban-core/persistence/prisma/kanban-flow.prisma-repository.js"
import { ScrumBacklogPrismaRepository } from "../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { ScrumSprintPlanningPrismaRepository } from "../../modules/project-scrum-sprint-planning/persistence/prisma/scrum-sprint-planning.prisma-repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { emptyMaterializationMeta } from "../../modules/workspace-projects/domain/project-draft-materialization.js"
import { ProjectDraftPrismaRepository } from "../../modules/workspace-projects/persistence/prisma/project-draft.prisma-repository.js"
import { ProjectRuntimePrismaRepository } from "../../modules/workspace-project-runtime/persistence/prisma/project-runtime.prisma-repository.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "72000000-0000-4000-8000-000000000001"
const INTENT_ID = "82000000-0000-4000-8000-000000000002"
const WS_ID = "92000000-0000-4000-8000-000000000003"
const DRAFT_ID = "d2000000-0000-4000-8000-000000000010"
const PROJECT_ID = "p2000000-0000-4000-8000-000000000011"
const STORY_ID = "w3000000-0000-4000-8000-000000000012"
const SPRINT_ID = "s2000000-0000-4000-8000-000000000013"
const SESSION_ID = "g2000000-0000-4000-8000-000000000014"
const EMAIL = "scrum-kanban-pg@test.dev"

function storyItem(): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: STORY_ID,
    workspacePublicId: WS_ID,
    projectPublicId: PROJECT_ID,
    itemType: "user_story",
    title: "Historia PG",
    description: "",
    status: "open",
    sortOrder: 1,
    parentItemPublicId: null,
    createdByUserPublicId: USER_ID,
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
    assignmentHistory: [],
    storyPoints: 3,
    priorityLevel: "medium",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
  }
}

describe("Dominio Scrum/Kanban — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let sprints: ScrumSprintPlanningPrismaRepository
  let sessions: GuidedSprintPlanningSessionPrismaRepository
  let candidates: GuidedSprintPlanningCandidateItemPrismaRepository
  let baselines: GuidedSprintPlanningBaselinePrismaRepository
  let kanban: KanbanFlowPrismaRepository

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    sprints = new ScrumSprintPlanningPrismaRepository(ctx.prisma)
    sessions = new GuidedSprintPlanningSessionPrismaRepository(ctx.prisma)
    candidates = new GuidedSprintPlanningCandidateItemPrismaRepository(ctx.prisma)
    baselines = new GuidedSprintPlanningBaselinePrismaRepository(ctx.prisma)
    kanban = new KanbanFlowPrismaRepository(ctx.prisma)

    const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
    const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
    const workspaces = new WorkspacePrismaRepository(ctx.prisma)
    const drafts = new ProjectDraftPrismaRepository(ctx.prisma)
    const projects = new ProjectRuntimePrismaRepository(ctx.prisma)
    const backlog = new ScrumBacklogPrismaRepository(ctx.prisma)

    await intents.create({
      intentPublicId: INTENT_ID,
      emailNormalized: EMAIL,
      status: "ACTIVE",
      expiresAt: defaultIntentExpiry(),
    })
    await users.createRegisteredUser({
      publicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Scrum Kanban Tester",
      passwordHash: "hash",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    await workspaces.create({
      workspacePublicId: WS_ID,
      slug: `scrum-kanban-${Date.now()}`,
      displayName: "Scrum Kanban PG",
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    const now = new Date()
    await drafts.insert({
      draftPublicId: DRAFT_ID,
      workspacePublicId: WS_ID,
      createdByUserPublicId: USER_ID,
      status: "materialized",
      projectName: "Proyecto Scrum",
      charter: { name: "Proyecto Scrum" },
      methodologyAssessment: {
        teamMethodologicalMaturity: 3,
        controlTraceabilityComplianceNeed: 2,
        workNature: "product_delivery",
        uncertaintyLevel: 3,
        scopeStability: 3,
        changeAcceptance: 3,
        deliveryShape: "incremental_iterative",
        interruptionFrequency: 2,
        prioritizationType: "business_value",
      },
      recommendationResult: null,
      selectedApproach: "scrum",
      wasRecommendationOverridden: null,
      overrideJustification: null,
      materializedProjectPublicId: PROJECT_ID,
      trace: [],
      materialization: emptyMaterializationMeta(),
      createdAt: now,
      updatedAt: now,
    })
    await projects.insert({
      projectPublicId: PROJECT_ID,
      workspacePublicId: WS_ID,
      sourceDraftPublicId: DRAFT_ID,
      projectName: "Proyecto Scrum",
      operationalApproach: "scrum",
      initialConfigurationSummary: {
        kind: "scrum",
        materializationContainerReady: true,
        backlog: true,
        sprints: true,
        board: true,
        baseWorkItemTypes: true,
        baseMetrics: false,
      },
      status: "active",
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await backlog.insert(storyItem())
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("crea y lee sprint con status y unicidad de public_id", async () => {
    const now = new Date()
    await sprints.insertSprint({
      sprintPublicId: SPRINT_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      name: "Sprint 1",
      goal: "Entregar MVP",
      status: "planning",
      startDate: new Date(Date.UTC(2026, 5, 1)),
      endDate: new Date(Date.UTC(2026, 5, 14)),
      createdByUserPublicId: USER_ID,
      createdAt: now,
      updatedAt: now,
      closure: null,
      review: null,
      retrospective: null,
    })
    const loaded = await sprints.findSprintByPublicId(WS_ID, PROJECT_ID, SPRINT_ID)
    assert.ok(loaded)
    assert.equal(loaded?.status, "planning")
    assert.equal(loaded?.goal, "Entregar MVP")

    await assert.rejects(
      () =>
        sprints.insertSprint({
          sprintPublicId: SPRINT_ID,
          workspacePublicId: WS_ID,
          projectPublicId: PROJECT_ID,
          name: "Dup",
          goal: "",
          status: "active",
          startDate: null,
          endDate: null,
          createdByUserPublicId: USER_ID,
          createdAt: now,
          updatedAt: now,
          closure: null,
          review: null,
          retrospective: null,
        }),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )
  })

  it("asigna work_item a sprint vía sprint_assignments", async () => {
    const now = new Date()
    await sprints.insertMembership({
      sprintPublicId: SPRINT_ID,
      backlogItemPublicId: STORY_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sprintSortOrder: 1,
      committedAt: now,
      committedByUserPublicId: USER_ID,
      boardColumn: "todo",
    })
    const rows = await sprints.listMembershipsBySprintOrdered(WS_ID, PROJECT_ID, SPRINT_ID)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.backlogItemPublicId, STORY_ID)
    assert.equal(rows[0]?.sprintSortOrder, 1)
  })

  it("planning session, candidate items y baseline", async () => {
    const now = new Date()
    await sessions.insert({
      sessionPublicId: SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sprintPublicId: SPRINT_ID,
      sessionDate: "2026-06-01",
      sessionSlot: "morning",
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      planningMode: "guided_sprint_planning",
      facilitatorUserPublicId: USER_ID,
      productOwnerUserPublicId: null,
      status: "open",
      planningGoalDraft: "Planificar sprint",
      sprintGoalFinal: null,
      summary: null,
      agreements: [],
      followUps: [],
      capacityTotal: 20,
      capacityUnit: "story_points",
      bufferReserved: 2,
      bufferMode: "fixed",
      candidateItemCount: 1,
      committedItemCount: 0,
      excludedItemCount: 0,
      pendingDecisionCount: 1,
      planningWarnings: [],
      baselineCreated: false,
      baselinePublicId: null,
      additiveNotesAfterClose: [],
      transcriptAfterClose: null,
      startedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const session = await sessions.findBySprintPublicId(WS_ID, PROJECT_ID, SPRINT_ID)
    assert.ok(session)
    assert.equal(session?.sessionPublicId, SESSION_ID)

    const candidateId = randomUUID()
    await candidates.upsert({
      candidateItemPublicId: candidateId,
      sessionPublicId: SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sprintPublicId: SPRINT_ID,
      workItemPublicId: STORY_ID,
      isReadyForPlanning: true,
      isCommitted: true,
      isExcluded: false,
      excludedReason: null,
      excludedReasonNotes: null,
      riskNotes: "Riesgo bajo",
      dependencyNotes: null,
      capacityConcern: "none",
      planningDecisionNotes: null,
      commitmentDecisionByUserPublicIds: [USER_ID],
      createdAt: now,
      updatedAt: now,
    })
    const listed = await candidates.listBySession(WS_ID, PROJECT_ID, SESSION_ID)
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.workItemPublicId, STORY_ID)

    const baselineId = randomUUID()
    await baselines.insert({
      baselinePublicId: baselineId,
      sessionPublicId: SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sprintPublicId: SPRINT_ID,
      sprintGoal: "Entregar MVP",
      committedWorkItemPublicIds: [STORY_ID],
      capacityTotal: 20,
      capacityUnit: "story_points",
      bufferReserved: 2,
      knownRisks: ["Riesgo bajo"],
      knownDependencies: [],
      baselineWarnings: [],
      createdAt: now,
      createdByUserPublicId: USER_ID,
    })
    const baseline = await baselines.findBySessionPublicId(WS_ID, PROJECT_ID, SESSION_ID)
    assert.ok(baseline)
    assert.deepEqual(baseline?.committedWorkItemPublicIds, [STORY_ID])
    const latest = await baselines.findLatestBySprintPublicId(WS_ID, PROJECT_ID, SPRINT_ID)
    assert.equal(latest?.baselinePublicId, baselineId)
  })

  it("persiste kanban_flow_configs por proyecto", async () => {
    const template = buildDefaultKanbanFlowTemplate()
    const now = new Date()
    await kanban.insert({
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      entryColumnPublicId: template.entryColumnPublicId,
      wipNearThresholdRatio: 0.8,
      columns: template.columns,
      createdAt: now,
      updatedAt: now,
    })
    const flow = await kanban.findByProject(WS_ID, PROJECT_ID)
    assert.ok(flow)
    assert.equal(flow?.columns.length, 4)
    assert.equal(flow?.entryColumnPublicId, template.entryColumnPublicId)
  })
})
