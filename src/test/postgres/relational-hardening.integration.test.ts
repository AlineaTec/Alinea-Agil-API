/**
 * Integración — hardening relacional (kanban_columns, FKs, índices).
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { buildDefaultKanbanFlowTemplate } from "../../modules/project-kanban-core/domain/kanban-flow-template.js"
import { KanbanFlowPrismaRepository } from "../../modules/project-kanban-core/persistence/prisma/kanban-flow.prisma-repository.js"
import { ImpedimentPrismaRepository } from "../../modules/project-impediments/persistence/prisma/impediment.prisma-repository.js"
import { ScrumBacklogPrismaRepository } from "../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { ScrumSprintPlanningPrismaRepository } from "../../modules/project-scrum-sprint-planning/persistence/prisma/scrum-sprint-planning.prisma-repository.js"
import { PlatformTenantPrismaRepository } from "../../modules/platform-tenants/persistence/prisma/platform-tenant.prisma-repository.js"
import { WorkControlOverrideTokenPrismaRepository } from "../../modules/work-ready-done-controls/persistence/prisma/work-control-override-token.prisma-repository.js"
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

const USER_ID = "a1000000-0000-4000-8000-000000000001"
const INTENT_ID = "a2000000-0000-4000-8000-000000000002"
const WS_ID = "a3000000-0000-4000-8000-000000000003"
const DRAFT_ID = "a4000000-0000-4000-8000-000000000010"
const PROJECT_ID = "a5000000-0000-4000-8000-000000000011"
const STORY_ID = "a6000000-0000-4000-8000-000000000012"
const SPRINT_ID = "a7000000-0000-4000-8000-000000000013"
const SPRINT_DONE_ID = "a8000000-0000-4000-8000-000000000014"
const EMAIL = "relational-hardening@test.dev"

function baseStory(columnPublicId: string | null): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: STORY_ID,
    workspacePublicId: WS_ID,
    projectPublicId: PROJECT_ID,
    itemType: "user_story",
    title: "Historia hardened",
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
    kanbanColumnPublicId: columnPublicId,
    isBlocked: false,
    blockedReason: null,
  }
}

describe("Relational hardening — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let kanban: KanbanFlowPrismaRepository
  let backlog: ScrumBacklogPrismaRepository
  let sprints: ScrumSprintPlanningPrismaRepository
  let impediments: ImpedimentPrismaRepository
  let platformTenants: PlatformTenantPrismaRepository
  let overrideTokens: WorkControlOverrideTokenPrismaRepository
  let entryColumnId: string

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    kanban = new KanbanFlowPrismaRepository(ctx.prisma)
    backlog = new ScrumBacklogPrismaRepository(ctx.prisma)
    sprints = new ScrumSprintPlanningPrismaRepository(ctx.prisma)
    impediments = new ImpedimentPrismaRepository(ctx.prisma)
    platformTenants = new PlatformTenantPrismaRepository(ctx.prisma)
    overrideTokens = new WorkControlOverrideTokenPrismaRepository(ctx.prisma)

    const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
    const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
    const workspaces = new WorkspacePrismaRepository(ctx.prisma)
    const drafts = new ProjectDraftPrismaRepository(ctx.prisma)
    const projects = new ProjectRuntimePrismaRepository(ctx.prisma)

    await intents.create({
      intentPublicId: INTENT_ID,
      emailNormalized: EMAIL,
      status: "ACTIVE",
      expiresAt: defaultIntentExpiry(),
    })
    await users.createRegisteredUser({
      publicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Hardening Tester",
      passwordHash: "hash",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    await workspaces.create({
      workspacePublicId: WS_ID,
      slug: `hardening-${Date.now()}`,
      displayName: "Hardening PG",
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    const now = new Date()
    await drafts.insert({
      draftPublicId: DRAFT_ID,
      workspacePublicId: WS_ID,
      createdByUserPublicId: USER_ID,
      status: "materialized",
      projectName: "Proyecto Kanban",
      charter: { name: "Proyecto Kanban" },
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
      selectedApproach: "kanban",
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
      projectName: "Proyecto Kanban",
      operationalApproach: "kanban",
      initialConfigurationSummary: { kind: "kanban" },
      status: "active",
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const template = buildDefaultKanbanFlowTemplate()
    await kanban.insert({
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      entryColumnPublicId: template.entryColumnPublicId,
      wipNearThresholdRatio: 0.8,
      columns: template.columns,
      createdAt: now,
      updatedAt: now,
    })
    entryColumnId = template.entryColumnPublicId
    await backlog.insert(baseStory(entryColumnId))
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("persiste columnas en kanban_columns (no solo jsonb)", async () => {
    const cols = await ctx.prisma.kanbanColumn.findMany({
      where: { project_public_id: PROJECT_ID },
      orderBy: { position: "asc" },
    })
    assert.equal(cols.length, 4)
    assert.ok(cols.some((c) => c.public_id === entryColumnId))
    const flow = await ctx.prisma.kanbanFlowConfig.findFirst({
      where: { project_public_id: PROJECT_ID },
    })
    assert.ok(flow)
    assert.deepEqual(flow?.flow_definition, { schemaVersion: 2 })
  })

  it("work_item tiene kanban_column_id FK al mover a columna", async () => {
    const item = await backlog.findByProjectAndItemId(WS_ID, PROJECT_ID, STORY_ID)
    assert.ok(item)
    await backlog.replace({ ...item!, kanbanColumnPublicId: entryColumnId, updatedAt: new Date() })
    const row = await ctx.prisma.workItem.findFirst({
      where: { public_id: STORY_ID },
      include: { kanban_column: true },
    })
    assert.ok(row?.kanban_column_id)
    assert.equal(row?.kanban_column?.public_id, entryColumnId)
  })

  it("override token exige work_item_id FK", async () => {
    const tokenId = randomUUID()
    const now = new Date()
    await overrideTokens.create({
      overrideTokenPublicId: tokenId,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      workItemPublicId: STORY_ID,
      eventCode: "kanban_wip_override",
      actorUserPublicId: USER_ID,
      reason: "test",
      expiresAt: new Date(now.getTime() + 60_000),
      consumedAt: null,
      createdAt: now,
    })
    const row = await ctx.prisma.workControlOverrideToken.findUnique({
      where: { public_id: tokenId },
    })
    assert.ok(row?.work_item_id)
    assert.equal(row?.work_item_public_id, STORY_ID)
  })

  it("impediment vincula sprint_id cuando hay related_sprint_public_id", async () => {
    const now = new Date()
    await sprints.insertSprint({
      sprintPublicId: SPRINT_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      name: "Sprint H",
      goal: "",
      status: "planning",
      startDate: null,
      endDate: null,
      createdByUserPublicId: USER_ID,
      createdAt: now,
      updatedAt: now,
      closure: null,
      review: null,
      retrospective: null,
    })
    const impId = randomUUID()
    await impediments.insert({
      impedimentPublicId: impId,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      relatedWorkItemPublicId: STORY_ID,
      relatedSprintPublicId: SPRINT_ID,
      title: "Bloqueo",
      description: "",
      status: "open",
      severity: "medium",
      responsibleUserPublicId: null,
      reportedByUserPublicId: USER_ID,
      detectedAt: now,
      resolvedAt: null,
      dismissedAt: null,
      resolutionSummary: null,
      dismissalReason: null,
      createdAt: now,
      updatedAt: now,
    })
    const row = await ctx.prisma.projectImpediment.findUnique({
      where: { public_id: impId },
      include: { related_sprint: true },
    })
    assert.ok(row?.sprint_id)
    assert.equal(row?.related_sprint?.public_id, SPRINT_ID)
  })

  it("platform_tenant tiene workspace_id FK", async () => {
    const tenantId = randomUUID()
    const now = new Date()
    await platformTenants.insert({
      platformTenantId: tenantId,
      workspacePublicId: WS_ID,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    const row = await ctx.prisma.platformTenant.findUnique({
      where: { platform_tenant_id: tenantId },
      include: { workspace: true },
    })
    assert.ok(row?.workspace_id)
    assert.equal(row?.workspace?.public_id, WS_ID)
  })

  it("completed_in_sprint_id se setea al cerrar ítem en sprint", async () => {
    const now = new Date()
    await sprints.insertSprint({
      sprintPublicId: SPRINT_DONE_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      name: "Sprint Done",
      goal: "",
      status: "closed",
      startDate: null,
      endDate: null,
      createdByUserPublicId: USER_ID,
      createdAt: now,
      updatedAt: now,
      closure: null,
      review: null,
      retrospective: null,
    })
    const item = await backlog.findByProjectAndItemId(WS_ID, PROJECT_ID, STORY_ID)
    assert.ok(item)
    await backlog.replace({
      ...item!,
      completedInSprintPublicId: SPRINT_DONE_ID,
      updatedAt: new Date(),
    })
    const row = await ctx.prisma.workItem.findFirst({
      where: { public_id: STORY_ID },
      include: { completed_in_sprint: true },
    })
    assert.ok(row?.completed_in_sprint_id)
    assert.equal(row?.completed_in_sprint?.public_id, SPRINT_DONE_ID)
  })
})
