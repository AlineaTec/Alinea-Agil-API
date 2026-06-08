import { DailyAlignmentParticipantUpdatePrismaRepository } from "../../../modules/daily-alignment/persistence/prisma/daily-alignment-participant-update.prisma-repository.js"
import { DailyAlignmentSessionPrismaRepository } from "../../../modules/daily-alignment/persistence/prisma/daily-alignment-session.prisma-repository.js"
import { GuidedRefinementReviewedItemPrismaRepository } from "../../../modules/guided-refinement/persistence/prisma/guided-refinement-reviewed-item.prisma-repository.js"
import { GuidedReviewDemonstratedItemPrismaRepository } from "../../../modules/guided-review/persistence/prisma/guided-review-demonstrated-item.prisma-repository.js"
import { GuidedReviewFeedbackPrismaRepository } from "../../../modules/guided-review/persistence/prisma/guided-review-feedback.prisma-repository.js"
import { GuidedReviewSessionPrismaRepository } from "../../../modules/guided-review/persistence/prisma/guided-review-session.prisma-repository.js"
import { GuidedRetrospectiveActionItemPrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-action-item.prisma-repository.js"
import { GuidedRetrospectiveContributionPrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-contribution.prisma-repository.js"
import { GuidedRetrospectiveSessionPrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-session.prisma-repository.js"
import { GuidedRetrospectiveTopicPrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-topic.prisma-repository.js"
import { GuidedRetrospectiveVotePrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-vote.prisma-repository.js"
import { OperatingSnapshotNbaSnoozePrismaRepository } from "../../../modules/project-operating-snapshot/persistence/prisma/operating-snapshot-nba-snooze.prisma-repository.js"
import { ScrumSprintPlanningPrismaRepository } from "../../../modules/project-scrum-sprint-planning/persistence/prisma/scrum-sprint-planning.prisma-repository.js"
import { TransactionalEmailOutboundMessagePrismaRepository } from "../../../modules/transactional-email/persistence/prisma/transactional-email-outbound-message.prisma-repository.js"
import { WorkspaceAuditLogPrismaRepository } from "../../../modules/workspace-audit-log/persistence/prisma/workspace-audit-log.prisma-repository.js"
import { WorkspaceInvitationPrismaRepository } from "../../../modules/workspace-invitations/persistence/prisma/workspace-invitation.prisma-repository.js"
import { WorkTeamProjectLinkPrismaRepository } from "../../../modules/workspace-work-teams/persistence/prisma/work-team-project-link.prisma-repository.js"
import { WorkActivityNotificationPrismaRepository } from "../../../modules/work-activity-notifications/persistence/prisma/work-activity-notification.prisma-repository.js"
import { WorkItemImplicitFollowPrismaRepository } from "../../../modules/work-activity-notifications/persistence/prisma/work-item-implicit-follow.prisma-repository.js"
import { WorkItemCommentsPrismaRepository } from "../../../modules/work-item-comments/persistence/prisma/work-item-comments.prisma-repository.js"
import { WorkItemTimeEntriesPrismaRepository } from "../../../modules/work-item-time-logging/persistence/prisma/work-item-time-entries.prisma-repository.js"
import {
  seedProductFeedback,
  seedWorkActivityNotification,
} from "./extras.js"
import {
  DEMO,
  demoUserPublicId,
  impedimentPublicId,
  scrumStoryPublicId,
  scrumTaskPublicId,
  workCommentPublicId,
  workTimeEntryPublicId,
  kanbanItemPublicId,
} from "./ids-demo.js"
import { seedScrumImpediment, seedScrumTasks, seedSprintClosure } from "./scrum.js"
import type { SeedContext } from "./context.js"
import { daysAgo, daysAhead } from "./dates.js"

export type AcmeDemoEnrichmentOpts = {
  workspacePublicId: string
  ownerUserPublicId: string
}

export async function seedAcmeDemoEnrichment(
  ctx: SeedContext,
  opts: AcmeDemoEnrichmentOpts,
): Promise<void> {
  const ws = opts.workspacePublicId
  const owner = opts.ownerUserPublicId
  const u = demoUserPublicId

  await seedTeamProjectLinks(ctx, ws)
  await seedPendingInvitation(ctx, ws, owner)
  await seedScrumTasks(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    authorUserPublicId: owner,
    parentStoryPublicId: scrumStoryPublicId(1),
    tasks: [
      { publicId: scrumTaskPublicId(1, 1), title: "Diseño flujo OTP", sortOrder: 1, assigneePublicId: u(4) },
      { publicId: scrumTaskPublicId(1, 2), title: "Integración proveedor SMS", sortOrder: 2, assigneePublicId: u(5) },
      { publicId: scrumTaskPublicId(1, 3), title: "Pruebas regresión login", sortOrder: 3, assigneePublicId: u(6) },
    ],
  })
  await seedScrumTasks(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    authorUserPublicId: owner,
    parentStoryPublicId: scrumStoryPublicId(6),
    tasks: [
      { publicId: scrumTaskPublicId(6, 1), title: "Validación antifraude", sortOrder: 1, assigneePublicId: u(4) },
      { publicId: scrumTaskPublicId(6, 2), title: "UI selector de puntos", sortOrder: 2, assigneePublicId: u(7) },
    ],
  })

  const sprintRepo = new ScrumSprintPlanningPrismaRepository(ctx.prisma)
  for (const [storyIdx, col] of [
    [6, "in_progress"],
    [7, "in_progress"],
    [8, "to_do"],
  ] as const) {
    try {
      await sprintRepo.updateMembershipBoardColumn(
        ws,
        DEMO.scrumProjectId,
        DEMO.sprint2Id,
        scrumStoryPublicId(storyIdx),
        col,
      )
    } catch {
      // membership may not exist for all stories
    }
  }

  await seedSprintClosure(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    sprintPublicId: DEMO.sprint1Id,
    closedByUserPublicId: u(2),
    items: [1, 2, 3, 4, 5].map((i) => ({
      backlogItemPublicId: scrumStoryPublicId(i),
      title: `Historia sprint 1 #${i}`,
      finalBoardColumn: i <= 3 ? ("done" as const) : ("in_progress" as const),
      outcome: i <= 3 ? ("completed" as const) : ("not_completed" as const),
      storyPointsAtClosure: 5,
    })),
  })

  await seedCollaboration(ctx, ws, owner)
  await seedGuidedSessionsRich(ctx, ws, owner)
  await seedMoreImpedimentsAndFeedback(ctx, ws)
  await seedWorkspaceAuditSamples(ctx, ws, owner)
  await seedNbaSnooze(ctx, ws)
  await seedEmailLedgerSample(ctx)

  ctx.log("ACME: enriquecimiento demo (guided, colaboración, auditoría, etc.)")
}

async function seedTeamProjectLinks(ctx: SeedContext, ws: string): Promise<void> {
  const links = new WorkTeamProjectLinkPrismaRepository(ctx.prisma)
  const now = ctx.now
  const rows = [
    {
      teamProjectLinkPublicId: DEMO.teamAlphaProjectLinkId,
      teamPublicId: DEMO.teamAlphaId,
      projectPublicId: DEMO.scrumProjectId,
    },
    {
      teamProjectLinkPublicId: DEMO.teamBetaKanbanLinkId,
      teamPublicId: DEMO.teamBetaId,
      projectPublicId: DEMO.kanbanProjectId,
    },
    {
      teamProjectLinkPublicId: DEMO.teamBetaScrumLinkId,
      teamPublicId: DEMO.teamBetaId,
      projectPublicId: DEMO.scrumProjectId,
    },
  ]
  for (const row of rows) {
    try {
      await links.insert({
        ...row,
        workspacePublicId: ws,
        createdAt: now,
        updatedAt: now,
      })
    } catch {
      // already linked
    }
  }
}

async function seedPendingInvitation(
  ctx: SeedContext,
  ws: string,
  invitedBy: string,
): Promise<void> {
  const invitations = new WorkspaceInvitationPrismaRepository(ctx.prisma)
  const existing = await invitations.findPendingByWorkspaceAndEmail(ws, "consultor.externo@acme-retail.pe")
  if (existing) return
  await invitations.insert({
    invitationPublicId: DEMO.invitationPendingId,
    workspacePublicId: ws,
    emailNormalized: "consultor.externo@acme-retail.pe",
    fullNameProposed: "Consultor Externo ACME",
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: "scrum_developer",
    assignSeatProposal: true,
    tokenHash: `seed-invite-acme-${DEMO.invitationPendingId}`,
    status: "pending",
    expiresAt: daysAhead(ctx.now, 14),
    invitedByUserPublicId: invitedBy,
    acceptedAt: null,
    revokedAt: null,
    supersededByInvitationPublicId: null,
    emailCommsSentAt: daysAgo(ctx.now, 1),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  })
}

async function seedCollaboration(ctx: SeedContext, ws: string, _owner: string): Promise<void> {
  const comments = new WorkItemCommentsPrismaRepository(ctx.prisma)
  const timeEntries = new WorkItemTimeEntriesPrismaRepository(ctx.prisma)
  const follows = new WorkItemImplicitFollowPrismaRepository(ctx.prisma)
  const notifications = new WorkActivityNotificationPrismaRepository(ctx.prisma)
  const now = ctx.now
  const u = demoUserPublicId

  const commentSpecs = [
    {
      id: workCommentPublicId("s", 1),
      projectId: DEMO.scrumProjectId,
      itemId: scrumStoryPublicId(1),
      author: u(2),
      body: "¿Confirmamos el proveedor SMS para OTP? Necesitamos SLA < 30s.",
    },
    {
      id: workCommentPublicId("s", 2),
      projectId: DEMO.scrumProjectId,
      itemId: scrumStoryPublicId(6),
      author: u(4),
      body: "Antifraude validó el límite de 50% de descuento con puntos.",
    },
    {
      id: workCommentPublicId("k", 1),
      projectId: DEMO.kanbanProjectId,
      itemId: kanbanItemPublicId(2),
      author: u(3),
      body: "Apple Pay sigue en revisión legal; actualicé la fecha estimada.",
    },
  ]

  for (const c of commentSpecs) {
    try {
      await comments.insert({
        commentPublicId: c.id,
        workspacePublicId: ws,
        projectPublicId: c.projectId,
        backlogItemPublicId: c.itemId,
        body: c.body,
        createdByUserPublicId: c.author,
        deletedAt: null,
        deletedByUserPublicId: null,
        createdAt: now,
        updatedAt: now,
      })
    } catch {
      // duplicate
    }
  }

  const timeSpecs = [
    {
      id: workTimeEntryPublicId("s", 1),
      projectId: DEMO.scrumProjectId,
      itemId: scrumStoryPublicId(1),
      userId: u(4),
      minutes: 120,
      note: "Implementación endpoint OTP",
      workDate: daysAgo(now, 3),
    },
    {
      id: workTimeEntryPublicId("s", 2),
      projectId: DEMO.scrumProjectId,
      itemId: scrumStoryPublicId(2),
      userId: u(5),
      minutes: 90,
      note: "Modelo de datos recompensas",
      workDate: daysAgo(now, 2),
    },
    {
      id: workTimeEntryPublicId("k", 1),
      projectId: DEMO.kanbanProjectId,
      itemId: kanbanItemPublicId(5),
      userId: u(2),
      minutes: 60,
      note: "Workshop requisitos panel B2B",
      workDate: daysAgo(now, 1),
    },
  ]

  for (const t of timeSpecs) {
    try {
      await timeEntries.insert({
        timeEntryPublicId: t.id,
        workspacePublicId: ws,
        projectPublicId: t.projectId,
        backlogItemPublicId: t.itemId,
        userPublicId: t.userId,
        minutesSpent: t.minutes,
        workDate: t.workDate,
        note: t.note,
        createdAt: now,
        updatedAt: now,
        createdByUserPublicId: t.userId,
        updatedByUserPublicId: t.userId,
      })
    } catch {
      // duplicate
    }
  }

  const followItems = [scrumStoryPublicId(1), scrumStoryPublicId(6), kanbanItemPublicId(2)]
  for (const itemId of followItems) {
    for (const followerIdx of [1, 2, 3, 4]) {
      try {
        await follows.touch({
          workspacePublicId: ws,
          userPublicId: u(followerIdx),
          backlogItemPublicId: itemId,
          at: now,
        })
      } catch {
        // skip if user/item linkage not resolvable
      }
    }
  }

  await seedWorkActivityNotification(ctx, {
    notificationPublicId: DEMO.notifAssignedId,
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    recipientUserPublicId: u(4),
    workItemPublicId: scrumStoryPublicId(6),
    actorUserPublicId: u(2),
    dedupeKey: `seed-acme-assigned-${scrumStoryPublicId(6)}`,
    title: "Te asignaron una historia",
  })

  try {
    await notifications.insert({
      notificationPublicId: DEMO.notifKanbanId,
      workspacePublicId: ws,
      recipientUserPublicId: u(3),
      eventType: "BLOCKED",
      eventCategory: "work_activity",
      sourceEntityType: "backlog_item",
      sourceEntityPublicId: kanbanItemPublicId(2),
      projectPublicId: DEMO.kanbanProjectId,
      sprintPublicId: null,
      boardColumnPublicId: DEMO.kanbanColProgress,
      title: "Ítem bloqueado en tablero",
      summary: "Integración Apple Pay bloqueada por certificación.",
      actorUserPublicId: u(4),
      actorDisplayName: "Carlos Mendoza",
      triggeredAt: now,
      readAt: null,
      isRead: false,
      isResponsibilityRelated: true,
      isFollowingRelated: false,
      navigationTarget: {
        kind: "scrum_backlog_item",
        projectPublicId: DEMO.kanbanProjectId,
        workItemPublicId: kanbanItemPublicId(2),
        sprintPublicId: null,
        boardColumnPublicId: DEMO.kanbanColProgress,
      },
      groupingKey: null,
      dedupeKey: `seed-acme-blocked-${kanbanItemPublicId(2)}`,
      resourceAvailability: "available",
      retentionExpiresAt: daysAhead(now, 90),
    })
  } catch {
    // duplicate
  }
}

async function seedGuidedSessionsRich(
  ctx: SeedContext,
  ws: string,
  owner: string,
): Promise<void> {
  const now = ctx.now
  const u = demoUserPublicId
  const sessionDate = "2026-06-03"
  const scrum = DEMO.scrumProjectId

  const dailySessions = new DailyAlignmentSessionPrismaRepository(ctx.prisma)
  const dailyParticipants = new DailyAlignmentParticipantUpdatePrismaRepository(ctx.prisma)
  if (!(await dailySessions.findByKey(ws, scrum, sessionDate, "morning"))) {
    await dailySessions.insert({
      sessionPublicId: DEMO.dailySessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      sessionDate,
      sessionSlot: "morning",
      sprintPublicId: DEMO.sprint2Id,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      alignmentMode: "live",
      facilitatorUserPublicId: u(2),
      status: "closed",
      startedAt: daysAgo(now, 1),
      closedAt: now,
      closeoutSummary: "Equipo alineado en prioridad de canje en checkout.",
      facilitatorTranscript: "Revisamos impedimento backend y acordamos pairing.",
      agreements: ["Pairing antifraude martes/jueves"],
      escalatedImpediments: [impedimentPublicId(2)],
      followUps: ["Validar SLA SMS con proveedor"],
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const [idx, plan] of [
    [4, "Cerrar endpoint OTP y pruebas en staging"],
    [5, "Modelar catálogo de premios tier oro"],
    [6, "Integrar listener de órdenes pagadas"],
  ] as const) {
    await dailyParticipants.upsert({
      participantUpdatePublicId: `eb14000${idx}-0000-4000-8000-000000000001`,
      sessionPublicId: DEMO.dailySessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      userPublicId: u(idx),
      yesterdaySummary: "Avance en tareas del sprint Rewards",
      todayPlan: plan,
      impediments: idx === 4 ? "Dependencia API antifraude" : "Ninguno",
      suggestionBasisSnapshot: { source: "seed", sprint: DEMO.sprint2Id },
      consistencyHintsSnapshot: null,
      sourceMode: "manual",
      isSubmitted: true,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  }

  const refinementItems = new GuidedRefinementReviewedItemPrismaRepository(ctx.prisma)
  for (const [idx, storyNum] of [
    [1, 7],
    [2, 8],
    [3, 9],
  ] as const) {
    await refinementItems.upsert({
      reviewedItemPublicId: `eb15000${idx}-0000-4000-8000-000000000001`,
      sessionPublicId: DEMO.refinementSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      sessionDate: "2026-06-01",
      workItemPublicId: scrumStoryPublicId(storyNum),
      reviewStatus: "reviewed",
      readyForPlanning: true,
      readyWithObservations: idx === 2,
      observations: idx === 2 ? "Falta definir métricas de retención" : null,
      businessClarifications: "Aprobado por PO ACME",
      technicalQuestions: null,
      dependenciesText: null,
      risksText: null,
      estimationStatus: "recorded",
      sizeConcern: "none",
      notReadyReasons: [],
      followUpRequired: false,
      reviewedByUserPublicIds: [u(2), owner],
      createdAt: now,
      updatedAt: now,
    })
  }

  const reviewSessions = new GuidedReviewSessionPrismaRepository(ctx.prisma)
  const reviewDemonstrated = new GuidedReviewDemonstratedItemPrismaRepository(ctx.prisma)
  const reviewFeedback = new GuidedReviewFeedbackPrismaRepository(ctx.prisma)
  if (!(await reviewSessions.findByKey(ws, scrum, sessionDate, "evening"))) {
    await reviewSessions.insert({
      sessionPublicId: DEMO.reviewSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      sessionDate,
      sessionSlot: "evening",
      sprintPublicId: DEMO.sprint1Id,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      reviewMode: "live",
      facilitatorUserPublicId: u(2),
      productOwnerUserPublicId: owner,
      status: "closed",
      reviewGoalSummary: "Validar incremento del Sprint 1 — Fundamentos",
      closeSummary: "Stakeholders aprobaron demo de puntos y notificaciones.",
      agreements: ["Publicar a beta interna"],
      followUps: [],
      stakeholderSummary: "Gerencia retail satisfecha con avance",
      openQuestionsRemaining: [],
      methodologicalNotes: null,
      incrementAssessment: "sufficient",
      sprintGoalAssessment: "achieved",
      sprintGoalAssessmentExplanation: "Objetivos de fundamentos cumplidos",
      transcriptAfterClose: null,
      additiveNotesAfterClose: [],
      demonstratedItemCount: 2,
      feedbackCount: 1,
      backlogImpactCount: 0,
      startedAt: daysAgo(now, 13),
      closedAt: daysAgo(now, 12),
      createdAt: now,
      updatedAt: now,
    })
  }

  await reviewDemonstrated.upsert({
    demonstratedItemPublicId: "eb160001-0000-4000-8000-000000000001",
    sessionPublicId: DEMO.reviewSessionId,
    workspacePublicId: ws,
    projectPublicId: scrum,
    sessionDate,
    workItemPublicId: scrumStoryPublicId(5),
    demonstrationStatus: "demonstrated",
    demonstratedByUserPublicIds: [u(5)],
    demoNotes: "Demo push de hitos en dispositivo Android",
    stakeholderFeedbackSummary: "Excelente claridad",
    questionsRaised: [],
    followUpRequired: false,
    backlogImpactSuggested: false,
    priorityImpactSuggested: false,
    requiresFurtherValidation: false,
    reviewOutcome: "no_major_issues",
    createdAt: now,
    updatedAt: now,
  })

  await reviewFeedback.insert({
    feedbackEntryPublicId: "eb170001-0000-4000-8000-000000000001",
    sessionPublicId: DEMO.reviewSessionId,
    workspacePublicId: ws,
    projectPublicId: scrum,
    sourceType: "stakeholder",
    stakeholderDisplayName: "Dirección Comercial ACME",
    feedbackText: "Priorizar canje en checkout para el próximo sprint.",
    feedbackCategory: "value_and_outcome",
    affectsWorkItemPublicIds: [scrumStoryPublicId(6)],
    isGeneralFeedback: false,
    suggestedBacklogAction: null,
    suggestedPriorityImpact: "increase",
    marksFollowUp: true,
    marksBacklogImpact: true,
    marksPriorityImpact: true,
    createdByUserPublicId: owner,
    createdAt: now,
  })

  const retroTopics = new GuidedRetrospectiveTopicPrismaRepository(ctx.prisma)
  const retroContributions = new GuidedRetrospectiveContributionPrismaRepository(ctx.prisma)
  const retroVotes = new GuidedRetrospectiveVotePrismaRepository(ctx.prisma)
  const retroActions = new GuidedRetrospectiveActionItemPrismaRepository(ctx.prisma)
  const retroSessions = new GuidedRetrospectiveSessionPrismaRepository(ctx.prisma)

  try {
    await retroTopics.insert({
      topicPublicId: DEMO.retroTopic1Id,
      sessionPublicId: DEMO.retroSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      title: "Comunicación con backend",
      sortOrder: 1,
      voteCount: 2,
      voteStickerTotal: 2,
      createdByUserPublicId: u(3),
      createdAt: now,
      updatedAt: now,
    })
    await retroTopics.insert({
      topicPublicId: DEMO.retroTopic2Id,
      sessionPublicId: DEMO.retroSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      title: "Calidad en QA móvil",
      sortOrder: 2,
      voteCount: 1,
      voteStickerTotal: 1,
      createdByUserPublicId: u(5),
      createdAt: now,
      updatedAt: now,
    })

    await retroContributions.insert({
      contributionPublicId: DEMO.retroContribution1Id,
      sessionPublicId: DEMO.retroSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      authorUserPublicId: u(4),
      authorGuestLabel: null,
      visibilityMode: "visible_to_all",
      templateColumnKey: "went_well",
      content: "Buen pairing entre mobile y API durante el sprint",
      topicPublicId: DEMO.retroTopic1Id,
      topicStatus: "grouped",
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    await retroContributions.insert({
      contributionPublicId: DEMO.retroContribution2Id,
      sessionPublicId: DEMO.retroSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      authorUserPublicId: u(8),
      authorGuestLabel: null,
      visibilityMode: "visible_to_all",
      templateColumnKey: "to_improve",
      content: "Faltaron devices iOS en laboratorio de pruebas",
      topicPublicId: DEMO.retroTopic2Id,
      topicStatus: "grouped",
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    await retroVotes.upsertVote({
      votePublicId: DEMO.retroVote1Id,
      sessionPublicId: DEMO.retroSessionId,
      workspacePublicId: ws,
      projectPublicId: scrum,
      topicPublicId: DEMO.retroTopic1Id,
      userPublicId: u(2),
      stickerWeight: 2,
      createdAt: now,
      updatedAt: now,
    })

    await retroActions.replaceAllForSession(ws, scrum, DEMO.retroSessionId, [
      {
        actionItemPublicId: DEMO.retroAction1Id,
        sessionPublicId: DEMO.retroSessionId,
        workspacePublicId: ws,
        projectPublicId: scrum,
        title: "Reservar franja diaria de sync API-mobile",
        description: "15 min después de la daily",
        ownerUserPublicId: u(2),
        dueDate: "2026-06-20",
        priority: "high",
        sourceContributionIds: [DEMO.retroContribution1Id],
        sourceTopicPublicIds: [DEMO.retroTopic1Id],
        status: "pending",
        history: [],
        createdAt: now,
        updatedAt: now,
      },
    ])

    await retroSessions.updateDenormalizedCounts(ws, scrum, DEMO.retroSessionId, {
      contributionCount: 2,
      topicCount: 2,
      voteRecordCount: 1,
      sessionVoteStickerTotal: 2,
      participantCount: 5,
      participantWithContributionCount: 2,
      updatedAt: now,
    })
  } catch {
    // retro enrichment duplicate on partial re-run
  }
}

async function seedMoreImpedimentsAndFeedback(ctx: SeedContext, ws: string): Promise<void> {
  await seedScrumImpediment(ctx, {
    workspacePublicId: ws,
    projectPublicId: DEMO.kanbanProjectId,
    impedimentPublicId: impedimentPublicId(3),
    title: "Capacidad CDN insuficiente en pico",
    reporterUserPublicId: demoUserPublicId(7),
    workItemPublicId: kanbanItemPublicId(14),
  })

  await seedProductFeedback(ctx, {
    workspacePublicId: ws,
    userPublicId: demoUserPublicId(9),
    submissionPublicId: DEMO.feedback2Id,
    title: "Exportar métricas de flujo Kanban a CSV",
  })
}

async function seedWorkspaceAuditSamples(
  ctx: SeedContext,
  ws: string,
  owner: string,
): Promise<void> {
  const audit = new WorkspaceAuditLogPrismaRepository(ctx.prisma)
  const occurred = daysAgo(ctx.now, 2)
  const events = [
    {
      category: "scrum_backlog_item" as const,
      action: "story_points_updated",
      projectPublicId: DEMO.scrumProjectId,
      backlogItemPublicId: scrumStoryPublicId(9),
      previousValue: { storyPoints: 5 },
      nextValue: { storyPoints: 8 },
    },
    {
      category: "kanban_board_item" as const,
      action: "moved_between_columns",
      projectPublicId: DEMO.kanbanProjectId,
      backlogItemPublicId: kanbanItemPublicId(2),
      previousValue: { fromColumnPublicId: DEMO.kanbanColReady },
      nextValue: { toColumnPublicId: DEMO.kanbanColProgress },
    },
    {
      category: "guided_sprint_planning_session" as const,
      action: "guided_sprint_planning_session_closed",
      projectPublicId: DEMO.scrumProjectId,
      backlogItemPublicId: null,
      previousValue: null,
      nextValue: { sessionPublicId: DEMO.planningSessionId },
    },
    {
      category: "time_entry" as const,
      action: "time_entry_created",
      projectPublicId: DEMO.scrumProjectId,
      backlogItemPublicId: scrumStoryPublicId(1),
      previousValue: null,
      nextValue: { minutesSpent: 120 },
    },
  ]

  for (const ev of events) {
    await audit.append({
      workspacePublicId: ws,
      category: ev.category,
      action: ev.action as Parameters<typeof audit.append>[0]["action"],
      actorUserPublicId: owner,
      occurredAt: occurred,
      resource: {
        projectPublicId: ev.projectPublicId,
        backlogItemPublicId: ev.backlogItemPublicId,
      },
      previousValue: "previousValue" in ev ? ev.previousValue : null,
      nextValue: ev.nextValue,
    })
  }
}

async function seedNbaSnooze(ctx: SeedContext, ws: string): Promise<void> {
  const snooze = new OperatingSnapshotNbaSnoozePrismaRepository(ctx.prisma)
  const d = daysAhead(ctx.now, 7)
  const until = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
  await snooze.upsert({
    snoozePublicId: DEMO.nbaSnoozeId,
    workspacePublicId: ws,
    projectPublicId: DEMO.scrumProjectId,
    userPublicId: demoUserPublicId(1),
    snoozeKey: "impediment_escalation",
    snoozedUntilOperationalDate: until,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  })
}

async function seedEmailLedgerSample(ctx: SeedContext): Promise<void> {
  const ledger = new TransactionalEmailOutboundMessagePrismaRepository(ctx.prisma)
  await ledger.append({
    templateKey: "workspace_invitation_sent",
    toNormalized: "consultor.externo@acme-retail.pe",
    ok: true,
    providerMessageId: "seed-msg-acme-invite-001",
    errorMessage: null,
  })
  await ledger.append({
    templateKey: "workspace_member_added",
    toNormalized: DEMO.ownerEmail,
    ok: true,
    providerMessageId: "seed-msg-acme-welcome-001",
    errorMessage: null,
  })
}
