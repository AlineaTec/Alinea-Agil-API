import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { GuidedSprintPlanningSessionRepository } from "../../guided-sprint-planning/persistence/guided-sprint-planning-session.repository.js"
import type { GuidedRefinementSessionRepository } from "../../guided-refinement/persistence/guided-refinement-session.repository.js"
import type { GuidedRefinementReviewedItemRepository } from "../../guided-refinement/persistence/guided-refinement-reviewed-item.repository.js"
import type { DailyAlignmentSessionRepository } from "../../daily-alignment/persistence/daily-alignment-session.repository.js"
import type { GuidedReviewSessionRepository } from "../../guided-review/persistence/guided-review-session.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "../../guided-retrospective/persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../../guided-retrospective/persistence/guided-retrospective-action-item.repository.js"
import type { ImpedimentRepository } from "../../project-impediments/persistence/impediment.repository.js"
import { DAILY_ALIGNMENT_DEFAULT_SLOT } from "../../daily-alignment/domain/daily-alignment-session.js"
import {
  resolveOperationalTimeZoneIana,
  todayYmdOperational,
} from "../../daily-alignment/domain/operational-calendar.js"
import type { GuidedSprintPlanningSessionState } from "../../guided-sprint-planning/domain/guided-sprint-planning-session.js"
import type { ProjectOperatingSnapshot } from "../domain/operating-snapshot.dto.js"
import {
  OperatingSnapshotConflictError,
  OperatingSnapshotNotFoundError,
  OperatingSnapshotValidationError,
} from "../domain/operating-snapshot.errors.js"
import {
  resolveKanbanFocusCycle,
  resolvePredictiveFocusCycle,
  resolveScrumFocusCycle,
  findClosedSprintsMissingReview,
  type ResolvedFocusCycle,
} from "../domain/focus-cycle-resolver.js"
import {
  buildWizardState,
  deriveWizardStage,
  isConfigurationIncomplete,
} from "../domain/wizard-stage-derivation.js"
import { buildAlerts } from "../domain/alerts-builder.js"
import { applySnoozeToNba, buildNextBestAction } from "../domain/nba-builder.js"
import {
  buildRoleProjection,
  filterAlertsForRole,
  resolveViewerAccessLevel,
  resolveViewerRole,
} from "../domain/role-projection.js"
import { buildRitualStatus } from "../domain/ritual-status-builder.js"
import { isDailyPendingThresholdReached } from "../domain/snapshot-temporal.js"
import { DERIVATION_VERSION, SNAPSHOT_TTL_SECONDS } from "../domain/wizard-stage.js"
import { deepLinkDaily, deepLinkProjectHome } from "../domain/deep-links.js"
import type { OperatingSnapshotNbaSnoozeRepository } from "../persistence/operating-snapshot-nba-snooze.repository.js"
import { newSnoozeState } from "../persistence/operating-snapshot-nba-snooze.repository.js"
import { OperatingSnapshotCache } from "./operating-snapshot-cache.js"
import { assertCanReadOperatingSnapshot } from "../policies/operating-snapshot-authorization.policy.js"

export type GetOperatingSnapshotOptions = {
  forceRefresh?: boolean
  includeCalendarExtract?: boolean
}

export type SnoozeNbaInput = {
  snoozeKey: string
  snoozedUntilOperationalDate: string
}

export class OperatingSnapshotService {
  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly planningSessionRepo: GuidedSprintPlanningSessionRepository,
    private readonly refinementSessionRepo: GuidedRefinementSessionRepository,
    private readonly refinementReviewedItemRepo: GuidedRefinementReviewedItemRepository,
    private readonly dailySessionRepo: DailyAlignmentSessionRepository,
    private readonly reviewSessionRepo: GuidedReviewSessionRepository,
    private readonly retroSessionRepo: GuidedRetrospectiveSessionRepository,
    private readonly retroActionRepo: GuidedRetrospectiveActionItemRepository,
    private readonly impedimentRepo: ImpedimentRepository,
    private readonly snoozeRepo: OperatingSnapshotNbaSnoozeRepository,
    private readonly cache: OperatingSnapshotCache,
  ) {}

  async getOperatingSnapshot(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    options: GetOperatingSnapshotOptions = {},
  ): Promise<ProjectOperatingSnapshot> {
    assertCanReadOperatingSnapshot(actor)

    const cacheKey = this.cache.cacheKey(workspacePublicId, projectPublicId, actor.userPublicId)
    if (!options.forceRefresh) {
      const cached = this.cache.get(cacheKey)
      if (cached) return cached
    }

    try {
      await this.projectRuntime.getProjectRuntimeSummary(actor, workspacePublicId, projectPublicId)
    } catch (e) {
      if (e instanceof ProjectRuntimeNotFoundError) {
        throw new OperatingSnapshotNotFoundError()
      }
      throw e
    }

    const project = await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) {
      throw new OperatingSnapshotNotFoundError()
    }

    const timeZone = resolveOperationalTimeZoneIana()
    const todayYmd = todayYmdOperational(timeZone)
    const now = new Date()
    const archived = project.status === "archived"

    const [
      sprints,
      impedimentsOpen,
      impedimentsCritical,
      backlogReadyCount,
      retroActions,
      snoozes,
      refinementRecent,
      planningRecent,
      reviewRecent,
      retroRecent,
      dailyToday,
    ] = await Promise.all([
      project.operationalApproach === "scrum" ? this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId) : Promise.resolve([]),
      this.impedimentRepo.listByProject(workspacePublicId, projectPublicId, { status: ["open", "in_review", "mitigating"] }, { limit: 500, offset: 0 }),
      this.impedimentRepo.listByProject(workspacePublicId, projectPublicId, { status: ["open", "in_review", "mitigating"], severity: "critical" }, { limit: 100, offset: 0 }),
      project.operationalApproach === "predictive_phases"
        ? Promise.resolve(0)
        : this.refinementReviewedItemRepo.countDistinctWorkItemsLatestReadyForPlanning(workspacePublicId, projectPublicId),
      this.retroActionRepo.listByProject(workspacePublicId, projectPublicId),
      this.snoozeRepo.listActiveForUserProject(workspacePublicId, projectPublicId, actor.userPublicId, todayYmd),
      this.refinementSessionRepo.listRecentForProject(workspacePublicId, projectPublicId, 5),
      this.planningSessionRepo.listRecentForProject(workspacePublicId, projectPublicId, 10),
      this.reviewSessionRepo.listRecentForProject(workspacePublicId, projectPublicId, 20),
      this.retroSessionRepo.listRecentForProject(workspacePublicId, projectPublicId, 20),
      this.dailySessionRepo.findByKey(workspacePublicId, projectPublicId, todayYmd, DAILY_ALIGNMENT_DEFAULT_SLOT),
    ])

    const planningBySprint = new Map<string, GuidedSprintPlanningSessionState>()
    for (const s of planningRecent) {
      if (s.sprintPublicId && !planningBySprint.has(s.sprintPublicId)) {
        planningBySprint.set(s.sprintPublicId, s)
      }
    }

    let focusCycle: ResolvedFocusCycle
    if (archived) {
      focusCycle = resolveScrumFocusCycle({
        sprints,
        todayYmd,
        timeZone,
        planningSessionBySprintId: planningBySprint,
      })
      if (focusCycle.kind === "none" && project.operationalApproach !== "scrum") {
        focusCycle = { ...focusCycle, resolutionReason: "archived_frozen" }
      } else {
        focusCycle = { ...focusCycle, resolutionReason: "archived_frozen" }
      }
    } else if (project.operationalApproach === "scrum") {
      focusCycle = resolveScrumFocusCycle({
        sprints,
        todayYmd,
        timeZone,
        planningSessionBySprintId: planningBySprint,
      })
    } else if (project.operationalApproach === "kanban") {
      const openPlanning = planningRecent.find((s) => s.status === "open") ?? null
      focusCycle = resolveKanbanFocusCycle({
        openPlanningSession: openPlanning,
        recentPlanningSession: planningRecent[0] ?? null,
      })
    } else {
      focusCycle = resolvePredictiveFocusCycle()
    }

    const focusSprintId = focusCycle.sprint?.sprintPublicId ?? focusCycle.publicId
    const planningSession =
      (focusSprintId ? planningBySprint.get(focusSprintId) : null) ??
      planningRecent.find((s) => s.status === "open") ??
      null

    const reviewSession = this.findSessionForSprint(reviewRecent, focusSprintId) ?? reviewRecent[0] ?? null
    const retroSession = this.findSessionForSprint(retroRecent, focusSprintId) ?? retroRecent[0] ?? null
    const refinementSession = refinementRecent[0] ?? null

    const openRetroActions = retroActions.filter((a) => a.status !== "finished" && a.status !== "dropped")
    const overdueRetroActions = openRetroActions.filter((a) => a.dueDate != null && a.dueDate < todayYmd)

    const reviewPendingForFocus = this.isReviewPending(focusCycle, reviewSession)
    const retroPendingForFocus = this.isRetroPending(focusCycle, reviewSession, retroSession)

    const setupIncomplete = isConfigurationIncomplete(project.initialConfigurationSummary)
    const planningSessionOpen = planningSession?.status === "open"
    const planningSessionClosed = planningSession != null && planningSession.status !== "open"
    const sprintStuckInPlanning =
      focusCycle.sprint?.status === "planning" || focusCycle.sprint?.status === "ready_for_execution"
        ? planningSessionClosed && planningSession?.baselineCreated === true
        : false

    const missingBaseline =
      focusCycle.status === "active" && planningSession != null ? !planningSession.baselineCreated : false

    const closedMissingReview = findClosedSprintsMissingReview(sprints)
    const reviewPendingSprint =
      focusCycle.sprint?.status === "active"
        ? closedMissingReview.find((s) => s.sprintPublicId !== focusCycle.sprint?.sprintPublicId) ?? null
        : focusCycle.sprint?.status === "closed" && !focusCycle.sprint.review
          ? focusCycle.sprint
          : closedMissingReview[0] ?? null

    const dailyPendingToday = dailyToday == null || dailyToday.status !== "closed"
    const prepareStale =
      focusCycle.kind === "none" && backlogReadyCount > 0 && sprints.length === 0 && project.operationalApproach === "scrum"

    const wizardStage = deriveWizardStage({
      approach: project.operationalApproach,
      configurationSummary: project.initialConfigurationSummary,
      focusCycle,
      hasActiveSprint: sprints.some((s) => s.status === "active"),
      planningSessionOpen: !!planningSessionOpen,
      planningSessionClosed: !!planningSessionClosed,
      dailyTodayClosed: dailyToday?.status === "closed",
      reviewPendingForFocus,
      retroPendingForFocus,
      openRetroActionCount: openRetroActions.length,
      overdueRetroActionCount: overdueRetroActions.length,
      backlogReadyCount,
      archived,
    })

    const wizardState = buildWizardState(wizardStage, focusCycle)
    const viewerRole = resolveViewerRole(actor)

    const alerts = buildAlerts({
      projectPublicId,
      approach: project.operationalApproach,
      wizardStage,
      focusCycle,
      criticalImpedimentCount: impedimentsCritical.totalCount,
      planningSessionOpen: !!planningSessionOpen,
      planningWarningCount: planningSession?.planningWarnings?.length ?? 0,
      sprintStuckInPlanning,
      missingBaseline,
      reviewPendingSprint,
      retroPendingAfterReview: reviewPendingForFocus === false && retroPendingForFocus,
      dailyPendingToday: dailyPendingToday && project.operationalApproach !== "predictive_phases",
      dailyPendingThresholdReached: isDailyPendingThresholdReached(now, timeZone),
      overdueRetroActionCount: overdueRetroActions.length,
      prepareStale,
      setupIncomplete,
      hasAnySprint: sprints.length > 0,
    })

    const filteredAlerts = filterAlertsForRole(alerts, viewerRole)
    const snoozeKeys = new Set(snoozes.map((s) => s.snoozeKey))

    const ceremonialCompleteForStaleClosed =
      focusCycle.status === "closed" && !reviewPendingForFocus && !retroPendingForFocus

    let nextBestAction = buildNextBestAction({
      projectPublicId,
      approach: project.operationalApproach,
      wizardStage,
      focusCycle,
      alerts: filteredAlerts,
      viewerRole,
      archived,
      setupIncomplete,
      planningSessionOpen: !!planningSessionOpen,
      planningSessionClosed: !!planningSessionClosed,
      sprintStuckInPlanning,
      dailyPendingToday: dailyPendingToday && project.operationalApproach === "scrum",
      reviewPendingForFocus,
      retroPendingForFocus,
      overdueRetroActionCount: overdueRetroActions.length,
      ceremonialCompleteForStaleClosed,
      snoozeKeys,
      todayYmd,
    })

    if (viewerRole === "stakeholder") {
      nextBestAction = null
    } else {
      nextBestAction = applySnoozeToNba(nextBestAction, snoozeKeys)
    }

    if (archived) {
      nextBestAction = null
    }

    const committedItemCount =
      planningSession?.committedItemCount ?? (focusCycle.sprint ? await this.countCommittedItems(workspacePublicId, projectPublicId, focusCycle.sprint.sprintPublicId) : null)

    const ritualStatus = buildRitualStatus({
      approach: project.operationalApproach,
      projectPublicId,
      focusCycle,
      refinementSession,
      planningSession,
      dailyToday,
      reviewSession,
      retroSession,
      openRetroActionCount: openRetroActions.length,
      overdueRetroActionCount: overdueRetroActions.length,
    })

    const generatedAt = new Date()
    const expiresAt = new Date(generatedAt.getTime() + SNAPSHOT_TTL_SECONDS * 1000)

    const lifecycleStatus = archived
      ? "archived"
      : setupIncomplete
        ? "ready_partial"
        : "ready"

    const snapshot: ProjectOperatingSnapshot = {
      projectContext: {
        workspacePublicId,
        projectPublicId,
        projectName: project.projectName,
        operationalApproach: project.operationalApproach,
        operationalTimeZone: timeZone,
        projectLifecycleStatus: lifecycleStatus,
        viewerAccessLevel: resolveViewerAccessLevel(viewerRole),
      },
      wizardState,
      focusCycle: {
        kind: focusCycle.kind,
        publicId: focusCycle.publicId,
        displayName: focusCycle.displayName,
        status: focusCycle.status,
        startDate: focusCycle.startDate,
        endDate: focusCycle.endDate,
        goalSummary: focusCycle.goalSummary,
        hasBaseline: focusCycle.hasBaseline,
        baselinePublicId: focusCycle.baselinePublicId,
        daysRemaining: focusCycle.daysRemaining,
        isStale: focusCycle.isStale,
        resolutionReason: focusCycle.resolutionReason,
      },
      ritualStatus,
      alerts: filteredAlerts,
      nextBestAction,
      signals: {
        criticalImpedimentCount: impedimentsCritical.totalCount,
        openImpedimentCount: impedimentsOpen.totalCount,
        backlogReadyForPlanningCount:
          project.operationalApproach === "predictive_phases" ? null : backlogReadyCount,
        committedItemCount: project.operationalApproach === "scrum" ? committedItemCount : null,
        overdueRetroActionCount: overdueRetroActions.length,
        openRetroActionCount: openRetroActions.length,
        planningWarningCount: planningSession?.planningWarnings?.length ?? null,
        hasActiveSprint: project.operationalApproach === "scrum" ? sprints.some((s) => s.status === "active") : null,
        sprintCount: project.operationalApproach === "scrum" ? sprints.length : null,
        rhythmSummary: null,
        calendarExtract:
          options.includeCalendarExtract === false
            ? null
            : {
                timeZone,
                events: this.buildCalendarExtract({
                  projectPublicId,
                  todayYmd,
                  timeZone,
                  focusCycle,
                  dailyToday,
                  dailyPendingToday,
                }),
                hasMore: false,
              },
      },
      roleProjection: buildRoleProjection(viewerRole),
      refreshMeta: {
        generatedAt: generatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttlSeconds: SNAPSHOT_TTL_SECONDS,
        cacheKey,
        partial: false,
        partialSources: [],
        derivationVersion: DERIVATION_VERSION,
      },
    }

    this.cache.set(cacheKey, snapshot)
    return snapshot
  }

  async snoozeNba(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: SnoozeNbaInput,
  ): Promise<void> {
    assertCanReadOperatingSnapshot(actor)

    const project = await this.projectRuntime.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!project) throw new OperatingSnapshotNotFoundError()
    if (project.status === "archived") {
      throw new OperatingSnapshotConflictError("Cannot snooze NBA on archived project.")
    }

    if (!input.snoozeKey.trim() || !input.snoozedUntilOperationalDate.trim()) {
      throw new OperatingSnapshotValidationError("snoozeKey and snoozedUntilOperationalDate are required.")
    }

    await this.snoozeRepo.upsert(
      newSnoozeState({
        workspacePublicId,
        projectPublicId,
        userPublicId: actor.userPublicId,
        snoozeKey: input.snoozeKey,
        snoozedUntilOperationalDate: input.snoozedUntilOperationalDate,
      }),
    )

    this.cache.invalidateProject(workspacePublicId, projectPublicId)
  }

  private findSessionForSprint<T extends { sprintPublicId: string | null }>(
    sessions: T[],
    sprintPublicId: string | null | undefined,
  ): T | null {
    if (!sprintPublicId) return null
    return sessions.find((s) => s.sprintPublicId === sprintPublicId) ?? null
  }

  private isReviewPending(
    focusCycle: ResolvedFocusCycle,
    reviewSession: { status: string } | null,
  ): boolean {
    if (focusCycle.sprint?.status === "closed" && !focusCycle.sprint.review) return true
    if (reviewSession && reviewSession.status === "open") return true
    return false
  }

  private isRetroPending(
    focusCycle: ResolvedFocusCycle,
    reviewSession: { status: string } | null,
    retroSession: { status: string } | null,
  ): boolean {
    const reviewDone =
      focusCycle.sprint?.review != null || (reviewSession != null && reviewSession.status !== "open")
    if (!reviewDone) return false
    if (retroSession && ["open", "collecting", "voting", "closing", "planned"].includes(retroSession.status)) {
      return true
    }
    if (focusCycle.sprint?.status === "closed" && reviewDone && !focusCycle.sprint.retrospective) return true
    return false
  }

  private async countCommittedItems(
    workspacePublicId: string,
    projectPublicId: string,
    sprintPublicId: string,
  ): Promise<number> {
    const memberships = await this.sprintRepo.listMembershipsBySprintOrdered(
      workspacePublicId,
      projectPublicId,
      sprintPublicId,
    )
    return memberships.length
  }

  private buildCalendarExtract(input: {
    projectPublicId: string
    todayYmd: string
    timeZone: string
    focusCycle: ResolvedFocusCycle
    dailyToday: { status: string } | null
    dailyPendingToday: boolean
  }) {
    const events = []
    if (input.dailyPendingToday || input.dailyToday) {
      events.push({
        eventId: `daily:${input.todayYmd}`,
        kind: "daily_today",
        title: "Daily de hoy",
        startAt: `${input.todayYmd}T09:00:00.000Z`,
        endAt: null,
        severity: input.dailyPendingToday ? ("medium" as const) : null,
        deepLinkPath: deepLinkDaily(input.projectPublicId),
      })
    }
    if (input.focusCycle.endDate) {
      events.push({
        eventId: `sprint_end:${input.focusCycle.publicId ?? "none"}`,
        kind: "sprint_end",
        title: `Fin ${input.focusCycle.displayName ?? "ciclo"}`,
        startAt: `${input.focusCycle.endDate}T17:00:00.000Z`,
        endAt: null,
        severity: null,
        deepLinkPath: deepLinkProjectHome(input.projectPublicId),
      })
    }
    return events.slice(0, 7)
  }
}
