/**
 * Integración PostgreSQL — dominio projects / work items (Fase 3).
 * Requiere Docker (Testcontainers) o `DATABASE_URL_TEST` con POSTGRES_TEST_USE_ENV=1.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { ScrumBacklogPrismaRepository } from "../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { emptyMaterializationMeta } from "../../modules/workspace-projects/domain/project-draft-materialization.js"
import { ProjectDraftPrismaRepository } from "../../modules/workspace-projects/persistence/prisma/project-draft.prisma-repository.js"
import { ProjectRuntimePrismaRepository } from "../../modules/workspace-project-runtime/persistence/prisma/project-runtime.prisma-repository.js"
import { WorkActivityNotificationPrismaRepository } from "../../modules/work-activity-notifications/persistence/prisma/work-activity-notification.prisma-repository.js"
import { WorkItemImplicitFollowPrismaRepository } from "../../modules/work-activity-notifications/persistence/prisma/work-item-implicit-follow.prisma-repository.js"
import { WorkItemCommentsPrismaRepository } from "../../modules/work-item-comments/persistence/prisma/work-item-comments.prisma-repository.js"
import { WorkItemTimeEntriesPrismaRepository } from "../../modules/work-item-time-logging/persistence/prisma/work-item-time-entries.prisma-repository.js"
import { WorkTeamProjectLinkPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-project-link.prisma-repository.js"
import { WorkTeamPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team.prisma-repository.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "71000000-0000-4000-8000-000000000001"
const INTENT_ID = "81000000-0000-4000-8000-000000000002"
const WS_ID = "91000000-0000-4000-8000-000000000003"
const EMAIL = "projects-pg@test.dev"

function backlogItem(partial: {
  backlogItemPublicId: string
  projectPublicId: string
  itemType: ScrumBacklogItemState["itemType"]
  title: string
  parentItemPublicId?: string | null
  sortOrder?: number
}): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: partial.backlogItemPublicId,
    workspacePublicId: WS_ID,
    projectPublicId: partial.projectPublicId,
    itemType: partial.itemType,
    title: partial.title,
    description: "",
    status: "open",
    sortOrder: partial.sortOrder ?? 0,
    parentItemPublicId: partial.parentItemPublicId ?? null,
    createdByUserPublicId: USER_ID,
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "none",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
  }
}

describe("Dominio projects / work items — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let drafts: ProjectDraftPrismaRepository
  let projects: ProjectRuntimePrismaRepository
  let backlog: ScrumBacklogPrismaRepository
  let comments: WorkItemCommentsPrismaRepository
  let timeEntries: WorkItemTimeEntriesPrismaRepository
  let follows: WorkItemImplicitFollowPrismaRepository
  let notifications: WorkActivityNotificationPrismaRepository
  let projectLinks: WorkTeamProjectLinkPrismaRepository

  const DRAFT_ID = "d1000000-0000-4000-8000-000000000010"
  const PROJECT_ID = "p1000000-0000-4000-8000-000000000011"
  const EPIC_ID = "w1000000-0000-4000-8000-000000000012"
  const STORY_ID = "w2000000-0000-4000-8000-000000000013"

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    drafts = new ProjectDraftPrismaRepository(ctx.prisma)
    projects = new ProjectRuntimePrismaRepository(ctx.prisma)
    backlog = new ScrumBacklogPrismaRepository(ctx.prisma)
    comments = new WorkItemCommentsPrismaRepository(ctx.prisma)
    timeEntries = new WorkItemTimeEntriesPrismaRepository(ctx.prisma)
    follows = new WorkItemImplicitFollowPrismaRepository(ctx.prisma)
    notifications = new WorkActivityNotificationPrismaRepository(ctx.prisma)
    projectLinks = new WorkTeamProjectLinkPrismaRepository(ctx.prisma)

    const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
    const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
    const workspaces = new WorkspacePrismaRepository(ctx.prisma)

    await intents.create({
      intentPublicId: INTENT_ID,
      emailNormalized: EMAIL,
      status: "ACTIVE",
      expiresAt: defaultIntentExpiry(),
    })
    await users.createRegisteredUser({
      publicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Projects Tester",
      passwordHash: "hash",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    await workspaces.create({
      workspacePublicId: WS_ID,
      slug: `projects-${Date.now()}`,
      displayName: "Projects PG",
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("crea y lee project_draft con FK a workspace", async () => {
    const now = new Date()
    await drafts.insert({
      draftPublicId: DRAFT_ID,
      workspacePublicId: WS_ID,
      createdByUserPublicId: USER_ID,
      status: "definition_in_progress",
      projectName: "Borrador PG",
      charter: { name: "Borrador PG" },
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
      selectedApproach: null,
      wasRecommendationOverridden: null,
      overrideJustification: null,
      materializedProjectPublicId: null,
      trace: [],
      materialization: emptyMaterializationMeta(),
      createdAt: now,
      updatedAt: now,
    })
    const loaded = await drafts.findByWorkspaceAndDraftPublicId(WS_ID, DRAFT_ID)
    assert.ok(loaded)
    assert.equal(loaded?.projectName, "Borrador PG")
  })

  it("crea project con public_id único y workspace_id coherente", async () => {
    const now = new Date()
    await projects.insert({
      projectPublicId: PROJECT_ID,
      workspacePublicId: WS_ID,
      sourceDraftPublicId: DRAFT_ID,
      projectName: "Proyecto PG",
      operationalApproach: "scrum",
      initialConfigurationSummary: {
        kind: "scrum",
        materializationContainerReady: true,
        backlog: true,
        sprints: false,
        board: false,
        baseWorkItemTypes: true,
        baseMetrics: false,
      },
      status: "active",
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    const loaded = await projects.findByWorkspaceAndProjectPublicId(WS_ID, PROJECT_ID)
    assert.ok(loaded)
    assert.equal(loaded?.sourceDraftPublicId, DRAFT_ID)

    await assert.rejects(
      () =>
        projects.insert({
          projectPublicId: PROJECT_ID,
          workspacePublicId: WS_ID,
          sourceDraftPublicId: randomUUID(),
          projectName: "Dup",
          operationalApproach: "kanban",
          initialConfigurationSummary: {
            kind: "kanban",
            materializationContainerReady: true,
            continuousBoard: false,
            baseColumns: false,
            wipPolicies: false,
            baseMetrics: false,
          },
          status: "active",
          materializedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )
  })

  it("persiste work_items con jerarquía padre/hijo", async () => {
    await backlog.insert(
      backlogItem({
        backlogItemPublicId: EPIC_ID,
        projectPublicId: PROJECT_ID,
        itemType: "epic",
        title: "Épica",
        sortOrder: 1,
      }),
    )
    await backlog.insert(
      backlogItem({
        backlogItemPublicId: STORY_ID,
        projectPublicId: PROJECT_ID,
        itemType: "user_story",
        title: "Historia",
        parentItemPublicId: EPIC_ID,
        sortOrder: 2,
      }),
    )
    const story = await backlog.findByProjectAndItemId(WS_ID, PROJECT_ID, STORY_ID)
    assert.ok(story)
    assert.equal(story?.parentItemPublicId, EPIC_ID)
    const listed = await backlog.listByProject(WS_ID, PROJECT_ID)
    assert.equal(listed.length, 2)
  })

  it("comentarios, time entries, follows implícitos y notificaciones", async () => {
    const now = new Date()
    const commentId = randomUUID()
    await comments.insert({
      commentPublicId: commentId,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      backlogItemPublicId: STORY_ID,
      body: "Comentario PG",
      createdByUserPublicId: USER_ID,
      deletedAt: null,
      deletedByUserPublicId: null,
      createdAt: now,
      updatedAt: now,
    })
    const comment = await comments.findActiveByIds(WS_ID, PROJECT_ID, STORY_ID, commentId)
    assert.ok(comment)
    assert.equal(comment?.body, "Comentario PG")

    const timeEntryId = randomUUID()
    await timeEntries.insert({
      timeEntryPublicId: timeEntryId,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      backlogItemPublicId: STORY_ID,
      userPublicId: USER_ID,
      minutesSpent: 45,
      workDate: new Date(Date.UTC(2026, 5, 1)),
      note: "Trabajo",
      createdAt: now,
      updatedAt: now,
      createdByUserPublicId: USER_ID,
      updatedByUserPublicId: USER_ID,
    })
    const summary = await timeEntries.getSummaryForItem(WS_ID, PROJECT_ID, STORY_ID)
    assert.equal(summary.totalLoggedMinutes, 45)
    assert.equal(summary.entryCount, 1)

    await follows.touch({
      workspacePublicId: WS_ID,
      userPublicId: USER_ID,
      backlogItemPublicId: STORY_ID,
      at: now,
    })
    const followers = await follows.listUserIdsFollowingItem({
      workspacePublicId: WS_ID,
      backlogItemPublicId: STORY_ID,
      now,
    })
    assert.deepEqual(followers, [USER_ID])

    const notificationId = randomUUID()
    const dedupeKey = `dedupe-${notificationId}`
    await notifications.insert({
      notificationPublicId: notificationId,
      workspacePublicId: WS_ID,
      recipientUserPublicId: USER_ID,
      eventType: "ASSIGNED",
      eventCategory: "work_activity",
      sourceEntityType: "backlog_item",
      sourceEntityPublicId: STORY_ID,
      projectPublicId: PROJECT_ID,
      sprintPublicId: null,
      boardColumnPublicId: null,
      title: "Asignación",
      summary: "Te asignaron un ítem",
      actorUserPublicId: USER_ID,
      actorDisplayName: "Tester",
      triggeredAt: now,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: true,
      isFollowingRelated: false,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: PROJECT_ID,
        workItemPublicId: STORY_ID,
        sprintPublicId: null,
        boardColumnPublicId: null,
      },
      groupingKey: null,
      dedupeKey,
      resourceAvailability: "available",
      retentionExpiresAt: new Date(now.getTime() + 86_400_000),
    })
    const unread = await notifications.countUnreadForRecipient({
      recipientUserPublicId: USER_ID,
      workspacePublicId: WS_ID,
      minTriggeredAt: new Date(0),
      maxTriggeredAt: new Date(now.getTime() + 86_400_000),
    })
    assert.equal(unread, 1)
    const listed = await notifications.listForRecipient({
      recipientUserPublicId: USER_ID,
      workspacePublicId: WS_ID,
      scope: "all",
      minTriggeredAt: new Date(0),
      maxTriggeredAt: new Date(now.getTime() + 86_400_000),
      limit: 10,
      after: null,
    })
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.notificationPublicId, notificationId)
  })

  it("work_team_project_links resuelve project_id FK", async () => {
    const teams = new WorkTeamPrismaRepository(ctx.prisma)
    const now = new Date()
    const teamPublicId = randomUUID()
    await teams.insert({
      teamPublicId,
      workspacePublicId: WS_ID,
      name: "Equipo PG",
      nameNormalized: "equipo pg",
      description: null,
      status: "active",
      teamLeadUserPublicId: USER_ID,
      targetSize: 3,
      createdAt: now,
      updatedAt: now,
    })
    await projectLinks.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS_ID,
      teamPublicId,
      projectPublicId: PROJECT_ID,
      createdAt: now,
      updatedAt: now,
    })
    const links = await projectLinks.listByProject(WS_ID, PROJECT_ID)
    assert.equal(links.length, 1)
    assert.equal(links[0]?.projectPublicId, PROJECT_ID)
  })
})
