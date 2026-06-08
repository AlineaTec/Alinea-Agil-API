import { ScrumBacklogPrismaRepository } from "../../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { ScrumBacklogItemState } from "../../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { ScrumSprintPlanningPrismaRepository } from "../../../modules/project-scrum-sprint-planning/persistence/prisma/scrum-sprint-planning.prisma-repository.js"
import { GuidedSprintPlanningSessionPrismaRepository } from "../../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-session.prisma-repository.js"
import { GuidedRefinementSessionPrismaRepository } from "../../../modules/guided-refinement/persistence/prisma/guided-refinement-session.prisma-repository.js"
import { GuidedRetrospectiveSessionPrismaRepository } from "../../../modules/guided-retrospective/persistence/prisma/guided-retrospective-session.prisma-repository.js"
import { ImpedimentPrismaRepository } from "../../../modules/project-impediments/persistence/prisma/impediment.prisma-repository.js"
import { WorkControlsProjectProfilePrismaRepository } from "../../../modules/work-ready-done-controls/persistence/prisma/work-controls-project-profile.prisma-repository.js"
import { buildDefaultV1Criteria } from "../../../modules/work-ready-done-controls/domain/work-ready-done-build-default-criteria.js"
import { daysAgo, utcDate } from "./dates.js"
import type { SeedContext } from "./context.js"

function baseItem(
  partial: Partial<ScrumBacklogItemState> & Pick<ScrumBacklogItemState, "backlogItemPublicId" | "title">,
  ctx: SeedContext,
  ws: string,
  project: string,
  author: string,
): ScrumBacklogItemState {
  const now = ctx.now
  return {
    workspacePublicId: ws,
    projectPublicId: project,
    itemType: "user_story",
    description: "",
    status: "open",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: author,
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
    ...partial,
  }
}

export async function seedScrumBacklog(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    authorUserPublicId: string
    epic: { publicId: string; title: string }
    stories: Array<{
      publicId: string
      title: string
      description?: string
      parentPublicId?: string
      points?: number
      priorityLevel?: ScrumBacklogItemState["priorityLevel"]
      status?: ScrumBacklogItemState["status"]
      assignedUserPublicId?: string | null
    }>
  },
): Promise<void> {
  const backlog = new ScrumBacklogPrismaRepository(ctx.prisma)
  const ws = opts.workspacePublicId
  const proj = opts.projectPublicId

  const epicState = baseItem(
    {
      backlogItemPublicId: opts.epic.publicId,
      title: opts.epic.title,
      itemType: "epic",
      sortOrder: 0,
      storyPoints: null,
    },
    ctx,
    ws,
    proj,
    opts.authorUserPublicId,
  )
  if (!(await backlog.findByProjectAndItemId(ws, proj, opts.epic.publicId))) {
    await backlog.insert(epicState)
  }

  let order = 1
  for (const s of opts.stories) {
    const now = ctx.now
    const assigned = s.assignedUserPublicId ?? null
    const st = baseItem(
      {
        backlogItemPublicId: s.publicId,
        title: s.title,
        description: s.description ?? "",
        itemType: "user_story",
        sortOrder: order++,
        parentItemPublicId: s.parentPublicId ?? opts.epic.publicId,
        storyPoints: s.points ?? 5,
        priorityLevel: s.priorityLevel ?? "medium",
        status: s.status ?? "open",
        assignedUserPublicId: assigned,
        assignmentUpdatedAt: assigned ? now : null,
        assignmentUpdatedByUserPublicId: assigned ? opts.authorUserPublicId : null,
        acceptanceCriteria: [
          {
            acceptanceCriterionPublicId: `${s.publicId}-ac1`,
            text: "Criterio de negocio validado con PO",
            status: s.status === "done" ? "done" : "pending",
            createdAt: now,
            updatedAt: now,
          },
          {
            acceptanceCriterionPublicId: `${s.publicId}-ac2`,
            text: "Pruebas funcionales en staging",
            status: "pending",
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
      ctx,
      ws,
      proj,
      opts.authorUserPublicId,
    )
    if (!(await backlog.findByProjectAndItemId(ws, proj, s.publicId))) {
      await backlog.insert(st)
    }
  }
  ctx.log(`Scrum backlog: 1 épica + ${opts.stories.length} historias`)
}

export async function seedScrumTasks(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    authorUserPublicId: string
    parentStoryPublicId: string
    tasks: Array<{ publicId: string; title: string; sortOrder: number; assigneePublicId?: string }>
  },
): Promise<void> {
  const backlog = new ScrumBacklogPrismaRepository(ctx.prisma)
  const ws = opts.workspacePublicId
  const proj = opts.projectPublicId
  const now = ctx.now
  for (const t of opts.tasks) {
    const assigned = t.assigneePublicId ?? null
    const st = baseItem(
      {
        backlogItemPublicId: t.publicId,
        title: t.title,
        itemType: "task",
        sortOrder: t.sortOrder,
        parentItemPublicId: opts.parentStoryPublicId,
        storyPoints: null,
        priorityLevel: "medium",
        status: "open",
        assignedUserPublicId: assigned,
        assignmentUpdatedAt: assigned ? now : null,
        assignmentUpdatedByUserPublicId: assigned ? opts.authorUserPublicId : null,
      },
      ctx,
      ws,
      proj,
      opts.authorUserPublicId,
    )
    if (!(await backlog.findByProjectAndItemId(ws, proj, t.publicId))) {
      await backlog.insert(st)
    }
  }
}

export async function seedSprintClosure(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    sprintPublicId: string
    closedByUserPublicId: string
    items: Array<{
      backlogItemPublicId: string
      title: string
      finalBoardColumn: "to_do" | "in_progress" | "done"
      outcome: "completed" | "not_completed"
      storyPointsAtClosure?: number | null
    }>
  },
): Promise<void> {
  const repo = new ScrumSprintPlanningPrismaRepository(ctx.prisma)
  const sprint = await repo.findSprintByPublicId(
    opts.workspacePublicId,
    opts.projectPublicId,
    opts.sprintPublicId,
  )
  if (!sprint) return
  const now = ctx.now
  await repo.replaceSprint({
    ...sprint,
    status: "closed",
    closure: {
      closedAt: daysAgo(now, 14),
      closedByUserPublicId: opts.closedByUserPublicId,
      closureNote: "Sprint cerrado con incremento entregado a negocio (seed demo ACME).",
      goalAchieved: true,
      sprintGoalAtClosure: sprint.goal ?? sprint.name,
    items: opts.items.map((item, idx) => ({
      backlogItemPublicId: item.backlogItemPublicId,
      itemType: "user_story",
      title: item.title,
      finalBoardColumn: item.finalBoardColumn,
      outcome: item.outcome,
      backlogStatusAtClosure: item.outcome === "completed" ? "done" : "open",
      sprintSortOrder: idx + 1,
        storyPointsAtClosure: item.storyPointsAtClosure ?? null,
        acceptanceCriteriaTotalCount: 2,
        acceptanceCriteriaPendingCount: item.outcome === "completed" ? 0 : 1,
        acceptanceCriteriaDoneCount: item.outcome === "completed" ? 2 : 1,
        acceptanceCriteriaReviewedCount: 0,
      })),
    },
  })
  ctx.log(`Scrum: cierre de sprint ${opts.sprintPublicId}`)
}

export async function seedScrumSprints(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    authorUserPublicId: string
    sprints: Array<{
      sprintPublicId: string
      name: string
      status: "planning" | "ready_for_execution" | "active" | "closed"
      startDate: Date | null
      endDate: Date | null
      assignments?: Array<{ workItemPublicId: string; sortOrder: number }>
    }>
  },
): Promise<void> {
  const repo = new ScrumSprintPlanningPrismaRepository(ctx.prisma)
  const now = ctx.now
  for (const sp of opts.sprints) {
    const existing = await repo.findSprintByPublicId(
      opts.workspacePublicId,
      opts.projectPublicId,
      sp.sprintPublicId,
    )
    if (!existing) {
      await repo.insertSprint({
        sprintPublicId: sp.sprintPublicId,
        workspacePublicId: opts.workspacePublicId,
        projectPublicId: opts.projectPublicId,
        name: sp.name,
        goal: `Objetivo ${sp.name}`,
        status: sp.status,
        startDate: sp.startDate,
        endDate: sp.endDate,
        createdByUserPublicId: opts.authorUserPublicId,
        createdAt: now,
        updatedAt: now,
        closure: null,
        review: null,
        retrospective: null,
      })
    }
    for (const a of sp.assignments ?? []) {
      try {
        await repo.insertMembership({
          sprintPublicId: sp.sprintPublicId,
          backlogItemPublicId: a.workItemPublicId,
          workspacePublicId: opts.workspacePublicId,
          projectPublicId: opts.projectPublicId,
          sprintSortOrder: a.sortOrder,
          committedAt: now,
          committedByUserPublicId: opts.authorUserPublicId,
          boardColumn: "to_do",
        })
      } catch {
        // duplicate
      }
    }
  }
  ctx.log(`Scrum: ${opts.sprints.length} sprints`)
}

export async function seedScrumGuidedSessions(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    sprintPublicId: string
    facilitatorUserPublicId: string
    planningSessionPublicId: string
    refinementSessionPublicId: string
    retroSessionPublicId: string
    sessionDate: string
  },
): Promise<void> {
  const now = ctx.now
  const ws = opts.workspacePublicId
  const proj = opts.projectPublicId

  const planning = new GuidedSprintPlanningSessionPrismaRepository(ctx.prisma)
  if (!(await planning.findBySprintPublicId(ws, proj, opts.sprintPublicId))) {
    await planning.insert({
      sessionPublicId: opts.planningSessionPublicId,
      workspacePublicId: ws,
      projectPublicId: proj,
      sprintPublicId: opts.sprintPublicId,
      sessionDate: opts.sessionDate,
      sessionSlot: "morning",
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      planningMode: "guided_sprint_planning",
      facilitatorUserPublicId: opts.facilitatorUserPublicId,
      productOwnerUserPublicId: opts.facilitatorUserPublicId,
      status: "closed",
      planningGoalDraft: "Planificar entrega",
      sprintGoalFinal: "Incremento demo",
      summary: "Sesión seed",
      agreements: [],
      followUps: [],
      capacityTotal: 40,
      capacityUnit: "story_points",
      bufferReserved: 5,
      bufferMode: "absolute",
      candidateItemCount: 3,
      committedItemCount: 3,
      excludedItemCount: 0,
      pendingDecisionCount: 0,
      planningWarnings: [],
      baselineCreated: false,
      baselinePublicId: null,
      additiveNotesAfterClose: [],
      transcriptAfterClose: null,
      startedAt: daysAgo(now, 7),
      closedAt: daysAgo(now, 6),
      createdAt: now,
      updatedAt: now,
    })
  }

  const refinement = new GuidedRefinementSessionPrismaRepository(ctx.prisma)
  if (!(await refinement.findByPublicId(ws, proj, opts.refinementSessionPublicId))) {
    await refinement.insert({
      sessionPublicId: opts.refinementSessionPublicId,
      workspacePublicId: ws,
      projectPublicId: proj,
      sessionDate: opts.sessionDate,
      sessionSlot: "afternoon",
      sprintPublicId: opts.sprintPublicId,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      refinementMode: "live",
      facilitatorUserPublicId: opts.facilitatorUserPublicId,
      productOwnerUserPublicId: opts.facilitatorUserPublicId,
      status: "closed",
      focusSummary: "Refinar historias del sprint",
      candidateWorkItemPublicIds: [],
      closeSummary: "Refinement demo seed",
      agreements: [],
      followUps: [],
      openQuestions: [],
      additiveNotesAfterClose: [],
      reviewedItemCount: 3,
      readyForPlanningCount: 2,
      pendingCandidateReviewCount: 0,
      reviewedNotReadyCount: 1,
      startedAt: daysAgo(now, 5),
      closedAt: daysAgo(now, 4),
      createdAt: now,
      updatedAt: now,
    })
  }

  const retro = new GuidedRetrospectiveSessionPrismaRepository(ctx.prisma)
  if (!(await retro.findByPublicId(ws, proj, opts.retroSessionPublicId))) {
    await retro.insert({
      sessionPublicId: opts.retroSessionPublicId,
      workspacePublicId: ws,
      projectPublicId: proj,
      sessionDate: opts.sessionDate,
      sessionSlot: "default",
      sprintPublicId: opts.sprintPublicId,
      retrospectivePeriod: null,
      operationalApproach: "scrum",
      operationalTimeZone: "America/Lima",
      retrospectiveMode: "classic",
      facilitatorUserPublicId: opts.facilitatorUserPublicId,
      status: "closed",
      templateKey: "classic",
      sessionCode: null,
      votesPerParticipant: 3,
      allowMultipleVotesPerTopic: false,
      defaultContributionVisibility: "visible_to_all",
      goalSummary: "Mejorar predictibilidad",
      summary: "Retro demo seed",
      agreements: ["Mejorar CI"],
      participantUserPublicIds: [opts.facilitatorUserPublicId],
      participantWithContributionUserPublicIds: [opts.facilitatorUserPublicId],
      participantCount: 1,
      participantWithContributionCount: 1,
      contributionCount: 1,
      topicCount: 1,
      voteRecordCount: 0,
      sessionVoteStickerTotal: 0,
      additiveNotesAfterClose: [],
      startedAt: daysAgo(now, 1),
      closedAt: now,
      transcriptAfterClose: null,
      contextHints: { seed: "demo" },
      createdAt: now,
      updatedAt: now,
    })
  }
  ctx.log("Scrum: sesiones guided (planning, refinement, retro)")
}

export async function seedScrumImpediment(
  ctx: SeedContext,
  opts: {
    workspacePublicId: string
    projectPublicId: string
    impedimentPublicId: string
    title: string
    description?: string
    reporterUserPublicId: string
    sprintPublicId?: string
    workItemPublicId?: string
    status?: "open" | "resolved" | "dismissed"
  },
): Promise<void> {
  const repo = new ImpedimentPrismaRepository(ctx.prisma)
  const now = ctx.now
  try {
    await repo.insert({
      impedimentPublicId: opts.impedimentPublicId,
      workspacePublicId: opts.workspacePublicId,
      projectPublicId: opts.projectPublicId,
      relatedWorkItemPublicId: opts.workItemPublicId ?? null,
      relatedSprintPublicId: opts.sprintPublicId ?? null,
      title: opts.title,
      description: opts.description ?? "Impedimento registrado en demo ACME S.A.",
      status: opts.status ?? "open",
      severity: "medium",
      responsibleUserPublicId: null,
      reportedByUserPublicId: opts.reporterUserPublicId,
      detectedAt: now,
      resolvedAt: null,
      dismissedAt: null,
      resolutionSummary: null,
      dismissalReason: null,
      createdAt: now,
      updatedAt: now,
    })
  } catch {
    // duplicate on partial re-run
  }
}

export async function seedScrumWorkControls(ctx: SeedContext, ws: string, proj: string): Promise<void> {
  const profiles = new WorkControlsProjectProfilePrismaRepository(ctx.prisma)
  const now = ctx.now
  await profiles.upsert({
    workspacePublicId: ws,
    projectPublicId: proj,
    approach: "scrum",
    version: 1,
    definitionSource: "project",
    criteria: buildDefaultV1Criteria(),
    kanbanColumnMapping: {
      startExecutionColumnPublicId: null,
      doneCloseItemColumnPublicId: null,
    },
    createdAt: now,
    updatedAt: now,
  })
}

export { utcDate, daysAgo }
