import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogItemType } from "../../project-scrum-backlog/domain/backlog-item-type.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { ListWorkTeamsFilters } from "../../workspace-work-teams/persistence/work-team.repository.js"
import { TeamFlowDeliveryMetricsNotFoundError } from "../domain/team-flow-delivery-metrics.errors.js"
import type { MethodologyContext, TeamFlowDeliverySummaryJson, ListTeamFlowDeliveryResultJson } from "../domain/team-flow-delivery-metrics.dto.js"
import {
  DataQualityWarningCode,
  FLOW_AGING_STALE_DAYS,
  FLOW_DEFAULT_ROLLING_WINDOW_DAYS,
  FlowFrictionCode,
  FRICTION_HIGH_UNASSIGNED_RATIO,
  FRICTION_MANY_REASSIGNMENTS_IN_WINDOW,
} from "../domain/team-flow-delivery-metrics.constants.js"
import { loadMethodologyForProjects, toSummaryBase } from "./team-flow-delivery-metrics.aggregation.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { isFlowAssignmentQualityReadable } from "../policies/team-flow-delivery-metrics-authorization.policy.js"
import { operationalProjectListingIsWorkspaceWide } from "../../workspace-project-runtime/policies/operational-project-listing-scope.policy.js"
import { actorMayReadWorkTeamOperationalSurface } from "../../workspace-project-runtime/policies/operational-work-team-read-access.js"

const EPIC: ScrumBacklogItemType = "epic"

function isWorkloadItemType(t: ScrumBacklogItemType): boolean {
  return t !== EPIC
}

function isActiveItem(it: ScrumBacklogItemState): boolean {
  return (it.status === "open" || it.status === "in_progress") && isWorkloadItemType(it.itemType)
}

export type FlowPeriodInternal = { from: Date; to: Date; label: string; kind: "rolling_7d_utc" | "custom" }

export class TeamFlowDeliveryMetricsService {
  constructor(
    private readonly teams: WorkTeamRepository,
    private readonly memberships: WorkTeamMembershipRepository,
    private readonly projectLinks: WorkTeamProjectLinkRepository,
    private readonly backlog: ScrumBacklogRepository,
    private readonly projectRuntime: ProjectRuntimeRepository,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly sprintMetrics: SprintMetricsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async requireTeam(workspacePublicId: string, teamPublicId: string) {
    const team = await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)
    if (!team) throw new TeamFlowDeliveryMetricsNotFoundError()
    return team
  }

  private async resolveProjectIds(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicIdFilter: string | undefined,
  ): Promise<string[]> {
    const links = await this.projectLinks.listByTeam(workspacePublicId, teamPublicId)
    let pids = links.map((l) => l.projectPublicId)
    if (projectPublicIdFilter) {
      if (!pids.includes(projectPublicIdFilter)) {
        return []
      }
      pids = [projectPublicIdFilter]
    }
    return pids
  }

  private async loadProjectsMeta(
    workspacePublicId: string,
    projectIds: string[],
  ): Promise<Map<string, WorkspaceRuntimeProjectState>> {
    const byProject = new Map<string, WorkspaceRuntimeProjectState>()
    for (const pid of projectIds) {
      const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, pid)
      if (p) byProject.set(pid, p)
    }
    return byProject
  }

  private resolvePeriod(fromIso?: string, toIso?: string): FlowPeriodInternal {
    const n = this.now()
    if (fromIso && toIso) {
      return {
        from: new Date(fromIso),
        to: new Date(toIso),
        label: "custom",
        kind: "custom",
      }
    }
    const to = n
    const from = new Date(to.getTime() - FLOW_DEFAULT_ROLLING_WINDOW_DAYS * 86_400_000)
    return {
      from,
      to,
      label: `rolling_${FLOW_DEFAULT_ROLLING_WINDOW_DAYS}d_utc`,
      kind: "rolling_7d_utc",
    }
  }

  private periodToJson(p: FlowPeriodInternal) {
    return {
      kind: p.kind,
      label: p.label,
      from: p.from.toISOString(),
      to: p.to.toISOString(),
    }
  }

  private listAllItems(workspacePublicId: string, projectIds: string[]): Promise<ScrumBacklogItemState[]> {
    return Promise.all(projectIds.map((pid) => this.backlog.listByProject(workspacePublicId, pid))).then((a) =>
      a.flat(),
    )
  }

  private countThroughput(
    items: ScrumBacklogItemState[],
    from: Date,
    to: Date,
  ): { throughput: number } {
    const t0 = from.getTime()
    const t1 = to.getTime()
    let throughput = 0
    for (const it of items) {
      if (!isWorkloadItemType(it.itemType)) continue
      if (it.status !== "done") continue
      const u = it.updatedAt.getTime()
      if (u >= t0 && u <= t1) throughput += 1
    }
    return { throughput }
  }

  private activeCounts(
    items: ScrumBacklogItemState[],
  ): { unassigned: number; blockedInFlow: number; oldActive: number; activeTotal: number; now: Date } {
    const now = this.now()
    const staleMs = FLOW_AGING_STALE_DAYS * 86_400_000
    let unassigned = 0
    let blockedInFlow = 0
    let oldActive = 0
    let activeTotal = 0
    for (const it of items) {
      if (!isActiveItem(it)) continue
      activeTotal += 1
      if (!it.assignedUserPublicId) unassigned += 1
      if (it.isBlocked) blockedInFlow += 1
      if (now.getTime() - it.createdAt.getTime() > staleMs) oldActive += 1
    }
    return { unassigned, blockedInFlow, oldActive, activeTotal, now }
  }

  private assignmentAggregates(
    items: ScrumBacklogItemState[],
    period: FlowPeriodInternal,
  ): { avgFirstAssignDays: number | null; reassignInPeriod: number; partialHistoryFlag: boolean } {
    const t0 = period.from.getTime()
    const t1 = period.to.getTime()
    let reassignInPeriod = 0
    const firstAssignDeltas: number[] = []
    let partial = false
    for (const it of items) {
      if (!isWorkloadItemType(it.itemType)) continue
      const hist = [...it.assignmentHistory].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())
      for (const ev of hist) {
        const ts = ev.changedAt.getTime()
        if (ts >= t0 && ts <= t1) reassignInPeriod += 1
      }
      if (it.assignedUserPublicId) {
        const first = hist.find((e) => e.newAssignedUserPublicId !== null)
        if (first) {
          firstAssignDeltas.push(first.changedAt.getTime() - it.createdAt.getTime())
        } else {
          if (it.assignmentUpdatedAt) {
            firstAssignDeltas.push(it.assignmentUpdatedAt.getTime() - it.createdAt.getTime())
            partial = true
          } else {
            partial = true
          }
        }
      }
    }
    const avgFirstAssignDays =
      firstAssignDeltas.length > 0
        ? Math.round((firstAssignDeltas.reduce((a, b) => a + b, 0) / firstAssignDeltas.length / 86_400_000) * 100) /
          100
        : null
    return { avgFirstAssignDays, reassignInPeriod, partialHistoryFlag: partial }
  }

  private async findLatestClosedSprintId(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<string | null> {
    const sprints = await this.sprintRepo.listSprintsByProject(workspacePublicId, projectPublicId)
    const closed = sprints
      .filter((s: ScrumSprintState) => s.status === "closed" && s.closure)
      .sort(
        (a, b) =>
          (b.closure?.closedAt.getTime() ?? 0) - (a.closure?.closedAt.getTime() ?? 0),
      )
    return closed[0]?.sprintPublicId ?? null
  }

  private async computeCarryOverRate(
    workspacePublicId: string,
    projectIds: string[],
    byProject: Map<string, WorkspaceRuntimeProjectState>,
  ): Promise<{ rate: number | null; hadGap: boolean }> {
    const ratios: number[] = []
    let hadGap = false
    for (const pid of projectIds) {
      const p = byProject.get(pid)
      if (!p || p.operationalApproach !== "scrum") continue
      const sid = await this.findLatestClosedSprintId(workspacePublicId, pid)
      if (!sid) {
        hadGap = true
        continue
      }
      try {
        const m = await this.sprintMetrics.getBasicSprintMetrics(workspacePublicId, pid, sid)
        if (m.committedItemsCount > 0) {
          ratios.push(m.notCompletedItemsCount / m.committedItemsCount)
        } else {
          hadGap = true
        }
      } catch {
        hadGap = true
      }
    }
    if (ratios.length === 0) return { rate: null, hadGap }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    return { rate: Math.round(mean * 10_000) / 10_000, hadGap }
  }

  private friction(
    p: { unassigned: number; activeTotal: number; oldActive: number; reassign: number; blocked: number },
  ): string[] {
    const s: string[] = []
    if (p.activeTotal > 0 && p.unassigned / p.activeTotal >= FRICTION_HIGH_UNASSIGNED_RATIO) {
      s.push(FlowFrictionCode.ELEVATED_UNASSIGNED)
    }
    if (p.oldActive > 0) s.push(FlowFrictionCode.STALE_ACTIVE_WORK)
    if (p.reassign > FRICTION_MANY_REASSIGNMENTS_IN_WINDOW) s.push(FlowFrictionCode.MANY_REASSIGNMENTS)
    if (p.blocked > 0) s.push(FlowFrictionCode.BLOCKED_ITEMS_PRESENT)
    return s
  }

  async getFlowSummary(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicIdFilter: string | undefined,
    fromOverride: string | undefined,
    toOverride: string | undefined,
    actor: WorkspaceMemberState,
  ): Promise<TeamFlowDeliverySummaryJson> {
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    const allowed = await actorMayReadWorkTeamOperationalSurface(
      this.memberships,
      actor,
      workspacePublicId,
      teamPublicId,
    )
    if (!allowed) {
      throw new TeamFlowDeliveryMetricsNotFoundError()
    }
    const projectIds = await this.resolveProjectIds(workspacePublicId, teamPublicId, projectPublicIdFilter)
    const pInt = this.resolvePeriod(fromOverride, toOverride)
    const period = this.periodToJson(pInt)
    const byProject = await this.loadProjectsMeta(workspacePublicId, projectIds)
    const methodology = loadMethodologyForProjects(byProject, projectIds)

    const items = await this.listAllItems(workspacePublicId, projectIds)
    const { throughput } = this.countThroughput(items, pInt.from, pInt.to)
    const { unassigned, blockedInFlow, oldActive, activeTotal } = this.activeCounts(items)
    const ass = this.assignmentAggregates(items, pInt)
    const carry = await this.computeCarryOverRate(workspacePublicId, projectIds, byProject)

    const canAssignQ = isFlowAssignmentQualityReadable(actor)
    const warnings: string[] = []
    const notes: string[] = [
      "throughputLastPeriod: count of non-epic items with status done whose updatedAt falls in the period; updatedAt is a completion proxy, not a dedicated completedAt (see dataQualityWarnings).",
    ]

    if (projectIds.length === 0) {
      warnings.push(DataQualityWarningCode.NO_LINKED_PROJECTS)
    }
    if (methodology === "mixed") {
      warnings.push(DataQualityWarningCode.METHODOLOGY_MIX)
      notes.push("Mixed Scrum/Kanban: carryOverRate is averaged only over Scrum projects; compare throughput across methodologies with care.")
    }
    if (ass.partialHistoryFlag) {
      warnings.push(DataQualityWarningCode.PARTIAL_ASSIGNMENT_HISTORY)
    }
    if (activeTotal > 0 && unassigned / activeTotal > 0.5) {
      warnings.push(DataQualityWarningCode.INSUFFICIENT_ASSIGNMENT_COVERAGE)
    }
    if (throughput < 2 && projectIds.length > 0) {
      warnings.push(DataQualityWarningCode.LOW_THROUGHPUT_VOLUME)
    }
    if (methodology === "scrum" || methodology === "mixed") {
      if (carry.hadGap && carry.rate === null) warnings.push(DataQualityWarningCode.CARRY_OVER_SOURCE_GAPS)
    }
    warnings.push(DataQualityWarningCode.THROUGHPUT_USES_ITEM_UPDATED_AT)
    const allLinkedAreScrum =
      projectIds.length > 0 && projectIds.every((id) => byProject.get(id)?.operationalApproach === "scrum")
    if (allLinkedAreScrum) {
      notes.push(
        "Blocked duration is not recorded on pure Scrum backlog items; blockedWorkItemsInFlowCount is usually 0. Kanban board items expose isBlocked; see dataQualityWarnings for BLOCKED_NOT_APPLICABLE on pure Scrum teams.",
      )
      warnings.push(DataQualityWarningCode.BLOCKED_NOT_APPLICABLE)
    }

    let carryOverRate: number | null = carry.rate
    if (methodology === "kanban") {
      carryOverRate = null
      warnings.push(DataQualityWarningCode.SCRUM_CARRY_NOT_APPLICABLE)
    }

    if (!canAssignQ) {
      warnings.push(DataQualityWarningCode.ASSIGNMENT_QUALITY_NOT_VISIBLE)
    }

    const friction = this.friction({
      unassigned,
      activeTotal,
      oldActive,
      reassign: ass.reassignInPeriod,
      blocked: blockedInFlow,
    })

    const hasSufficientData =
      projectIds.length > 0 && (items.length > 0 || projectIds.some((x) => byProject.get(x)?.operationalApproach === "scrum"))

    const summaryBody = toSummaryBase(team, projectIds, methodology, period, {
      throughputLastPeriod: throughput,
      carryOverRate,
      oldActiveWorkItemsCount: oldActive,
      unassignedWorkItemsCount: unassigned,
      blockedWorkItemsInFlowCount: blockedInFlow,
      averageBlockedTimeDays: null,
      averageTimeToFirstAssignmentDays: canAssignQ ? ass.avgFirstAssignDays : null,
      reassignmentEventCountInPeriod: canAssignQ ? ass.reassignInPeriod : null,
      flowFrictionSignalCodes: friction,
      hasSufficientData,
      dataQualityWarnings: [...new Set(warnings)],
      calculationNotes: notes,
    })

    return summaryBody
  }

  async listWorkspaceFlowTeams(
    workspacePublicId: string,
    options: {
      limit: number
      offset: number
      includeArchived: boolean
      projectPublicIdFilter?: string
      fromOverride?: string
      toOverride?: string
      methodologyFilter?: "scrum" | "kanban"
    },
    actor: WorkspaceMemberState,
  ): Promise<ListTeamFlowDeliveryResultJson> {
    const base: ListWorkTeamsFilters = options.includeArchived ? {} : { status: "active" }
    const filters: ListWorkTeamsFilters = operationalProjectListingIsWorkspaceWide(actor)
      ? base
      : { ...base, memberUserPublicId: actor.userPublicId }
    const { items: teams, totalCount } = await this.teams.list(
      workspacePublicId,
      filters,
      { limit: options.limit, offset: options.offset },
    )

    const out: TeamFlowDeliverySummaryJson[] = []
    const meth = { scrum: 0, kanban: 0, other: 0 }
    for (const t of teams) {
      const projectIds = await this.resolveProjectIds(workspacePublicId, t.teamPublicId, options.projectPublicIdFilter)
      const byProject = await this.loadProjectsMeta(workspacePublicId, projectIds)
      const mctx = loadMethodologyForProjects(byProject, projectIds)
      if (options.methodologyFilter) {
        const hasS = projectIds.some((id) => byProject.get(id)?.operationalApproach === "scrum")
        const hasK = projectIds.some((id) => byProject.get(id)?.operationalApproach === "kanban")
        if (options.methodologyFilter === "scrum" && !hasS) continue
        if (options.methodologyFilter === "kanban" && !hasK) continue
      }
      if (mctx === "scrum" || mctx === "mixed") meth.scrum += 1
      if (mctx === "kanban" || mctx === "mixed") meth.kanban += 1
      if (mctx === "other" || mctx === "unknown") meth.other += 1
      out.push(
        await this.getFlowSummary(
          workspacePublicId,
          t.teamPublicId,
          options.projectPublicIdFilter,
          options.fromOverride,
          options.toOverride,
          actor,
        ),
      )
    }

    const methodologyContextWorkspace: MethodologyContext =
      meth.scrum > 0 && meth.kanban > 0
        ? "mixed"
        : meth.scrum > 0
          ? "scrum"
          : meth.kanban > 0
            ? "kanban"
            : "unknown"
    const topWarnings: string[] = []
    if (meth.scrum > 0 && meth.kanban > 0) {
      topWarnings.push(DataQualityWarningCode.METHODOLOGY_MIX)
    }
    return {
      items: out,
      totalCount,
      limit: options.limit,
      offset: options.offset,
      methodologyContextWorkspace,
      dataQualityWarnings: topWarnings,
      calculationNotes: [
        "Comparative list uses the same v1 period rules as the team flow summary. Mixed-methodology workspace: do not treat Scrum throughput and Kanban throughput as the same kind of number without filtering by methodology and reading methodologyContext on each row.",
      ],
    }
  }
}
