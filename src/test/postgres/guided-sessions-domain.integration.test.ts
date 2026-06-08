/**
 * Integración PostgreSQL — dominio guided sessions (Fase 5).
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { DailyAlignmentParticipantUpdatePrismaRepository } from "../../modules/daily-alignment/persistence/prisma/daily-alignment-participant-update.prisma-repository.js"
import { DailyAlignmentSessionPrismaRepository } from "../../modules/daily-alignment/persistence/prisma/daily-alignment-session.prisma-repository.js"
import { GuidedRefinementReviewedItemPrismaRepository } from "../../modules/guided-refinement/persistence/prisma/guided-refinement-reviewed-item.prisma-repository.js"
import { GuidedRefinementSessionPrismaRepository } from "../../modules/guided-refinement/persistence/prisma/guided-refinement-session.prisma-repository.js"
import { GuidedReviewDemonstratedItemPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-demonstrated-item.prisma-repository.js"
import { GuidedReviewFeedbackPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-feedback.prisma-repository.js"
import { GuidedReviewSessionPrismaRepository } from "../../modules/guided-review/persistence/prisma/guided-review-session.prisma-repository.js"
import { GuidedRetrospectiveActionItemPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-action-item.prisma-repository.js"
import { GuidedRetrospectiveContributionPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-contribution.prisma-repository.js"
import { GuidedRetrospectiveSessionPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-session.prisma-repository.js"
import { GuidedRetrospectiveTopicPrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-topic.prisma-repository.js"
import { GuidedRetrospectiveVotePrismaRepository } from "../../modules/guided-retrospective/persistence/prisma/guided-retrospective-vote.prisma-repository.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { ScrumBacklogPrismaRepository } from "../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
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

const USER_ID = "74000000-0000-4000-8000-000000000001"
const INTENT_ID = "84000000-0000-4000-8000-000000000002"
const WS_ID = "94000000-0000-4000-8000-000000000003"
const DRAFT_ID = "d4000000-0000-4000-8000-000000000010"
const PROJECT_ID = "p4000000-0000-4000-8000-000000000011"
const STORY_ID = "w4000000-0000-4000-8000-000000000012"
const DAILY_SESSION_ID = "d4100000-0000-4000-8000-000000000020"
const REFINEMENT_SESSION_ID = "d4100001-0000-4000-8000-000000000021"
const REVIEW_SESSION_ID = "d4100002-0000-4000-8000-000000000022"
const RETRO_SESSION_ID = "d4100003-0000-4000-8000-000000000023"
const SESSION_DATE = "2026-06-04"
const SESSION_SLOT = "morning"
const EMAIL = "guided-sessions-pg@test.dev"

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  )
}

function storyItem(): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: STORY_ID,
    workspacePublicId: WS_ID,
    projectPublicId: PROJECT_ID,
    itemType: "user_story",
    title: "Historia guided sessions",
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
    storyPoints: 5,
    priorityLevel: "medium",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
  }
}

describe("Dominio guided sessions — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let dailySessions: DailyAlignmentSessionPrismaRepository
  let dailyParticipants: DailyAlignmentParticipantUpdatePrismaRepository
  let refinementSessions: GuidedRefinementSessionPrismaRepository
  let refinementItems: GuidedRefinementReviewedItemPrismaRepository
  let reviewSessions: GuidedReviewSessionPrismaRepository
  let reviewDemonstrated: GuidedReviewDemonstratedItemPrismaRepository
  let reviewFeedback: GuidedReviewFeedbackPrismaRepository
  let retroSessions: GuidedRetrospectiveSessionPrismaRepository
  let retroTopics: GuidedRetrospectiveTopicPrismaRepository
  let retroContributions: GuidedRetrospectiveContributionPrismaRepository
  let retroVotes: GuidedRetrospectiveVotePrismaRepository
  let retroActionItems: GuidedRetrospectiveActionItemPrismaRepository

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    dailySessions = new DailyAlignmentSessionPrismaRepository(ctx.prisma)
    dailyParticipants = new DailyAlignmentParticipantUpdatePrismaRepository(ctx.prisma)
    refinementSessions = new GuidedRefinementSessionPrismaRepository(ctx.prisma)
    refinementItems = new GuidedRefinementReviewedItemPrismaRepository(ctx.prisma)
    reviewSessions = new GuidedReviewSessionPrismaRepository(ctx.prisma)
    reviewDemonstrated = new GuidedReviewDemonstratedItemPrismaRepository(ctx.prisma)
    reviewFeedback = new GuidedReviewFeedbackPrismaRepository(ctx.prisma)
    retroSessions = new GuidedRetrospectiveSessionPrismaRepository(ctx.prisma)
    retroTopics = new GuidedRetrospectiveTopicPrismaRepository(ctx.prisma)
    retroContributions = new GuidedRetrospectiveContributionPrismaRepository(ctx.prisma)
    retroVotes = new GuidedRetrospectiveVotePrismaRepository(ctx.prisma)
    retroActionItems = new GuidedRetrospectiveActionItemPrismaRepository(ctx.prisma)

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
      fullName: "Guided Sessions Tester",
      passwordHash: "hash",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    await workspaces.create({
      workspacePublicId: WS_ID,
      slug: `guided-sessions-${Date.now()}`,
      displayName: "Guided Sessions PG",
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    const now = new Date()
    await drafts.insert({
      draftPublicId: DRAFT_ID,
      workspacePublicId: WS_ID,
      createdByUserPublicId: USER_ID,
      status: "materialized",
      projectName: "Proyecto Guided",
      charter: { name: "Proyecto Guided" },
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
      projectName: "Proyecto Guided",
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

  it("daily: sesión, participant update y unicidad por fecha/slot", async () => {
    const now = new Date()
    await dailySessions.insert({
      sessionPublicId: DAILY_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      sessionSlot: SESSION_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      alignmentMode: "live",
      facilitatorUserPublicId: USER_ID,
      status: "open",
      startedAt: now,
      closedAt: null,
      closeoutSummary: null,
      facilitatorTranscript: null,
      agreements: ["Acuerdo daily"],
      escalatedImpediments: [],
      followUps: ["Seguimiento"],
      createdAt: now,
      updatedAt: now,
    })
    const loaded = await dailySessions.findByKey(WS_ID, PROJECT_ID, SESSION_DATE, SESSION_SLOT)
    assert.ok(loaded)
    assert.equal(loaded?.sessionPublicId, DAILY_SESSION_ID)
    assert.deepEqual(loaded?.agreements, ["Acuerdo daily"])

    const participant = await dailyParticipants.upsert({
      participantUpdatePublicId: randomUUID(),
      sessionPublicId: DAILY_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      userPublicId: USER_ID,
      yesterdaySummary: "Ayer",
      todayPlan: "Hoy",
      impediments: "Ninguno",
      suggestionBasisSnapshot: { source: "test" },
      consistencyHintsSnapshot: null,
      sourceMode: "manual",
      isSubmitted: true,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    assert.equal(participant.todayPlan, "Hoy")
    const listed = await dailyParticipants.listBySession(WS_ID, PROJECT_ID, DAILY_SESSION_ID)
    assert.equal(listed.length, 1)

    await assert.rejects(
      () =>
        dailySessions.insert({
          ...loaded!,
          sessionPublicId: randomUUID(),
        }),
      isPrismaUniqueViolation,
    )
  })

  it("refinement: sesión, reviewed item y unicidad", async () => {
    const now = new Date()
    await refinementSessions.insert({
      sessionPublicId: REFINEMENT_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      sessionSlot: "afternoon",
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      refinementMode: "live",
      facilitatorUserPublicId: USER_ID,
      productOwnerUserPublicId: null,
      status: "open",
      focusSummary: "Refinar backlog",
      candidateWorkItemPublicIds: [STORY_ID],
      closeSummary: null,
      agreements: [],
      followUps: [],
      openQuestions: [],
      additiveNotesAfterClose: [],
      reviewedItemCount: 0,
      readyForPlanningCount: 0,
      pendingCandidateReviewCount: 1,
      reviewedNotReadyCount: 0,
      startedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const session = await refinementSessions.findByKey(
      WS_ID,
      PROJECT_ID,
      SESSION_DATE,
      "afternoon",
    )
    assert.ok(session)

    const reviewedId = randomUUID()
    await refinementItems.upsert({
      reviewedItemPublicId: reviewedId,
      sessionPublicId: REFINEMENT_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      workItemPublicId: STORY_ID,
      reviewStatus: "reviewed",
      readyForPlanning: true,
      readyWithObservations: false,
      observations: null,
      businessClarifications: null,
      technicalQuestions: null,
      dependenciesText: null,
      risksText: null,
      estimationStatus: "recorded",
      sizeConcern: "none",
      notReadyReasons: [],
      followUpRequired: false,
      reviewedByUserPublicIds: [USER_ID],
      createdAt: now,
      updatedAt: now,
    })
    const items = await refinementItems.listBySession(WS_ID, PROJECT_ID, REFINEMENT_SESSION_ID)
    assert.equal(items.length, 1)
    assert.equal(items[0]?.readyForPlanning, true)

    await assert.rejects(
      () =>
        refinementSessions.insert({
          ...session!,
          sessionPublicId: randomUUID(),
        }),
      isPrismaUniqueViolation,
    )
  })

  it("review: sesión, demonstrated item, feedback y unicidad", async () => {
    const now = new Date()
    await reviewSessions.insert({
      sessionPublicId: REVIEW_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      sessionSlot: "evening",
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      reviewMode: "live",
      facilitatorUserPublicId: USER_ID,
      productOwnerUserPublicId: null,
      status: "open",
      reviewGoalSummary: "Mostrar incremento",
      closeSummary: null,
      agreements: [],
      followUps: [],
      stakeholderSummary: null,
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: null,
      sprintGoalAssessment: null,
      sprintGoalAssessmentExplanation: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 0,
      feedbackCount: 0,
      backlogImpactCount: 0,
      startedAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const session = await reviewSessions.findByKey(WS_ID, PROJECT_ID, SESSION_DATE, "evening")
    assert.ok(session)

    const demonstratedId = randomUUID()
    await reviewDemonstrated.upsert({
      demonstratedItemPublicId: demonstratedId,
      sessionPublicId: REVIEW_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      workItemPublicId: STORY_ID,
      demonstrationStatus: "demonstrated",
      demonstratedByUserPublicIds: [USER_ID],
      demoNotes: "Demo OK",
      stakeholderFeedbackSummary: null,
      questionsRaised: [],
      followUpRequired: false,
      backlogImpactSuggested: false,
      priorityImpactSuggested: false,
      requiresFurtherValidation: false,
      reviewOutcome: "no_major_issues",
      createdAt: now,
      updatedAt: now,
    })
    const demonstrated = await reviewDemonstrated.listBySession(
      WS_ID,
      PROJECT_ID,
      REVIEW_SESSION_ID,
    )
    assert.equal(demonstrated.length, 1)

    const feedbackId = randomUUID()
    await reviewFeedback.insert({
      feedbackEntryPublicId: feedbackId,
      sessionPublicId: REVIEW_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sourceType: "stakeholder",
      stakeholderDisplayName: "Cliente",
      feedbackText: "Muy útil",
      feedbackCategory: "value_and_outcome",
      affectsWorkItemPublicIds: [STORY_ID],
      isGeneralFeedback: false,
      suggestedBacklogAction: null,
      suggestedPriorityImpact: null,
      marksFollowUp: true,
      marksBacklogImpact: false,
      marksPriorityImpact: false,
      createdByUserPublicId: USER_ID,
      createdAt: now,
    })
    const feedback = await reviewFeedback.listBySession(WS_ID, PROJECT_ID, REVIEW_SESSION_ID)
    assert.equal(feedback.length, 1)
    assert.equal(feedback[0]?.feedbackText, "Muy útil")
    assert.equal(feedback[0]?.marksFollowUp, true)

    await assert.rejects(
      () =>
        reviewSessions.insert({
          ...session!,
          sessionPublicId: randomUUID(),
        }),
      isPrismaUniqueViolation,
    )
  })

  it("retrospective: sesión, topic, contribution, vote, action items", async () => {
    const now = new Date()
    await retroSessions.insert({
      sessionPublicId: RETRO_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      sessionDate: SESSION_DATE,
      sessionSlot: "default",
      sprintPublicId: null,
      retrospectivePeriod: null,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      retrospectiveMode: "classic",
      facilitatorUserPublicId: USER_ID,
      status: "open",
      templateKey: "classic",
      sessionCode: null,
      votesPerParticipant: 3,
      allowMultipleVotesPerTopic: false,
      defaultContributionVisibility: "visible_to_all",
      goalSummary: "Mejorar flujo",
      summary: null,
      agreements: [],
      participantUserPublicIds: [USER_ID],
      participantWithContributionUserPublicIds: [],
      participantCount: 1,
      participantWithContributionCount: 0,
      contributionCount: 0,
      topicCount: 0,
      voteRecordCount: 0,
      sessionVoteStickerTotal: 0,
      startedAt: now,
      closedAt: null,
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      contextHints: { sprint: "1" },
      createdAt: now,
      updatedAt: now,
    })
    const session = await retroSessions.findByKey(WS_ID, PROJECT_ID, SESSION_DATE, "default")
    assert.ok(session)

    const topicId = randomUUID()
    await retroTopics.insert({
      topicPublicId: topicId,
      sessionPublicId: RETRO_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      title: "Comunicación",
      sortOrder: 1,
      voteCount: 0,
      voteStickerTotal: 0,
      createdByUserPublicId: USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    const topics = await retroTopics.listBySession(WS_ID, PROJECT_ID, RETRO_SESSION_ID)
    assert.equal(topics.length, 1)

    const contributionId = randomUUID()
    await retroContributions.insert({
      contributionPublicId: contributionId,
      sessionPublicId: RETRO_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      authorUserPublicId: USER_ID,
      authorGuestLabel: null,
      visibilityMode: "visible_to_all",
      templateColumnKey: "went_well",
      content: "Buen pairing",
      topicPublicId: topicId,
      topicStatus: "grouped",
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    const contributions = await retroContributions.listBySession(
      WS_ID,
      PROJECT_ID,
      RETRO_SESSION_ID,
    )
    assert.equal(contributions.length, 1)

    const voteId = randomUUID()
    await retroVotes.upsertVote({
      votePublicId: voteId,
      sessionPublicId: RETRO_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      topicPublicId: topicId,
      userPublicId: USER_ID,
      stickerWeight: 1,
      createdAt: now,
      updatedAt: now,
    })
    const votes = await retroVotes.listBySession(WS_ID, PROJECT_ID, RETRO_SESSION_ID)
    assert.equal(votes.length, 1)

    const actionItemId = randomUUID()
    await retroActionItems.replaceAllForSession(WS_ID, PROJECT_ID, RETRO_SESSION_ID, [
      {
        actionItemPublicId: actionItemId,
        sessionPublicId: RETRO_SESSION_ID,
        workspacePublicId: WS_ID,
        projectPublicId: PROJECT_ID,
        title: "Daily más corto",
        description: null,
        ownerUserPublicId: USER_ID,
        dueDate: "2026-06-15",
        priority: "medium",
        sourceContributionIds: [contributionId],
        sourceTopicPublicIds: [topicId],
        status: "pending",
        history: [],
        createdAt: now,
        updatedAt: now,
      },
    ])
    const actions = await retroActionItems.listBySession(WS_ID, PROJECT_ID, RETRO_SESSION_ID)
    assert.equal(actions.length, 1)
    assert.equal(actions[0]?.title, "Daily más corto")

    await assert.rejects(
      () =>
        retroSessions.insert({
          ...session!,
          sessionPublicId: randomUUID(),
        }),
      isPrismaUniqueViolation,
    )

    await retroVotes.upsertVote({
      votePublicId: voteId,
      sessionPublicId: RETRO_SESSION_ID,
      workspacePublicId: WS_ID,
      projectPublicId: PROJECT_ID,
      topicPublicId: topicId,
      userPublicId: USER_ID,
      stickerWeight: 2,
      createdAt: now,
      updatedAt: new Date(),
    })
    const votesAfter = await retroVotes.listBySession(WS_ID, PROJECT_ID, RETRO_SESSION_ID)
    assert.equal(votesAfter[0]?.stickerWeight, 2)
  })
})
