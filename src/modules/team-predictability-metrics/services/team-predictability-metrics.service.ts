import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import { KanbanMetricsService, startOfUtcWeekMonday } from "../../project-kanban-metrics/services/kanban-metrics.service.js"
import type { BasicSprintMetrics } from "../../project-scrum-sprint-metrics/domain/basic-sprint-metrics.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { ListWorkTeamsFilters, Pagination } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { WorkTeamState } from "../../workspace-work-teams/domain/work-team.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { TeamPredictabilityMetricsNotFoundError } from "../domain/team-predictability-metrics.errors.js"
import { operationalProjectListingIsWorkspaceWide } from "../../workspace-project-runtime/policies/operational-project-listing-scope.policy.js"
import { actorMayReadWorkTeamOperationalSurface } from "../../workspace-project-runtime/policies/operational-work-team-read-access.js"
import {
  PREDICTABILITY_DEFAULT_LAST_N,
  DataQualityWarningCode,
} from "../domain/team-predictability-metrics.constants.js"
import type { MethodologyContext } from "../domain/team-predictability-metrics.dto.js"
import type {
  KanbanPredictabilityNucleus,
  ListTeamPredictabilityResultJson,
  PredictabilityPeriod,
  ScrumPredictabilityNucleus,
  TeamPredictabilitySummaryJson,
  TeamPredictabilityTrendJson,
  TrendPointKanban,
  TrendPointScrum,
  VariationBlock,
} from "../domain/team-predictability-metrics.dto.js"
import {
  buildVariationBlock,
  hasSufficientDataFromPeriodCount,
  loadMethodologyForProjects,
  readinessFromPeriodCount,
} from "./team-predictability-metrics.aggregation.js"

function addUtcDays(d: Date, n: number): Date {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function meanArr(a: number[]): number {
  if (a.length === 0) return 0
  return a.reduce((s, x) => s + x, 0) / a.length
}

type ScrumPeriodRow = {
  projectPublicId: string
  sprintPublicId: string
  closedAt: Date
  metrics: BasicSprintMetrics
}

export class TeamPredictabilityMetricsService {
  constructor(
    private readonly teams: WorkTeamRepository,
    private readonly memberships: WorkTeamMembershipRepository,
    private readonly projectLinks: WorkTeamProjectLinkRepository,
    private readonly projectRuntime: ProjectRuntimeRepository,
    private readonly sprintRepo: ScrumSprintPlanningRepository,
    private readonly sprintMetrics: SprintMetricsService,
    private readonly kanbanMetrics: KanbanMetricsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async requireTeam(workspacePublicId: string, teamPublicId: string): Promise<WorkTeamState> {
    const team = await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)
    if (!team) throw new TeamPredictabilityMetricsNotFoundError()
    return team
  }

  private async requirePredictabilityTeamReadAccess(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
  ): Promise<void> {
    const ok = await actorMayReadWorkTeamOperationalSurface(
      this.memberships,
      actor,
      workspacePublicId,
      teamPublicId,
    )
    if (!ok) {
      throw new TeamPredictabilityMetricsNotFoundError()
    }
  }

  private teamListFiltersForActor(actor: WorkspaceMemberState, base: ListWorkTeamsFilters): ListWorkTeamsFilters {
    if (operationalProjectListingIsWorkspaceWide(actor)) {
      return base
    }
    return { ...base, memberUserPublicId: actor.userPublicId }
  }

  private async resolveProjectIds(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicIdFilter: string | undefined,
  ): Promise<string[]> {
    const links = await this.projectLinks.listByTeam(workspacePublicId, teamPublicId)
    let pids = links.map((l) => l.projectPublicId)
    if (projectPublicIdFilter) {
      if (!pids.includes(projectPublicIdFilter)) return []
      pids = [projectPublicIdFilter]
    }
    return pids
  }

  private async loadProjectsMeta(
    workspacePublicId: string,
    projectIds: string[],
  ): Promise<Map<string, WorkspaceRuntimeProjectState>> {
    const by = new Map<string, WorkspaceRuntimeProjectState>()
    for (const pid of projectIds) {
      const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, pid)
      if (p) by.set(pid, p)
    }
    return by
  }

  private async loadScrumPeriods(
    workspacePublicId: string,
    scrumProjectIds: string[],
    lastN: number,
  ): Promise<{
    rows: ScrumPeriodRow[]
    skippedLegacy: number
    hadMultiProject: boolean
  }> {
    const ref: { projectPublicId: string; sprint: ScrumSprintState; closedAt: Date }[] = []
    for (const pid of scrumProjectIds) {
      const sprints = await this.sprintRepo.listSprintsByProject(workspacePublicId, pid)
      for (const s of sprints) {
        if (s.status !== "closed" || !s.closure) continue
        ref.push({ projectPublicId: pid, sprint: s, closedAt: s.closure.closedAt })
      }
    }
    ref.sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
    const hadMultiProject = scrumProjectIds.length > 1
    let skippedLegacy = 0
    const rows: ScrumPeriodRow[] = []
    for (const r of ref) {
      if (rows.length >= lastN) break
      try {
        const m = await this.sprintMetrics.getBasicSprintMetrics(
          workspacePublicId,
          r.projectPublicId,
          r.sprint.sprintPublicId,
        )
        rows.push({
          projectPublicId: r.projectPublicId,
          sprintPublicId: r.sprint.sprintPublicId,
          closedAt: r.closedAt,
          metrics: m,
        })
      } catch {
        skippedLegacy += 1
      }
    }
    return { rows, skippedLegacy, hadMultiProject }
  }

  private scrumNucleusFrom(rows: ScrumPeriodRow[]): {
    nucleus: ScrumPredictabilityNucleus
    velocitySeries: number[]
    points: TrendPointScrum[]
  } {
    const commitRates: number[] = []
    const velocities: number[] = []
    const carryRates: number[] = []
    const points: TrendPointScrum[] = []
    for (const r of rows) {
      const m = r.metrics
      if (m.committedItemsCount > 0) {
        commitRates.push(m.completedItemsCount / m.committedItemsCount)
        carryRates.push(m.notCompletedItemsCount / m.committedItemsCount)
      }
      velocities.push(m.completedStoryPoints)
      const ccr = m.committedItemsCount > 0 ? m.completedItemsCount / m.committedItemsCount : null
      const cr = m.committedItemsCount > 0 ? m.notCompletedItemsCount / m.committedItemsCount : null
      points.push({
        kind: "scrum_sprint",
        projectPublicId: r.projectPublicId,
        sprintPublicId: r.sprintPublicId,
        label: m.sprintPublicId.slice(0, 8),
        closedAt: m.closedAt,
        committedItemsCount: m.committedItemsCount,
        completedItemsCount: m.completedItemsCount,
        notCompletedItemsCount: m.notCompletedItemsCount,
        commitmentCompletionRate: ccr,
        completedStoryPoints: m.completedStoryPoints,
        carryOverRate: cr,
        includedInPredictability: true,
        pointWarnings: [],
      })
    }
    const mVel = meanArr(velocities)
    const stdevV =
      velocities.length >= 2
        ? Math.sqrt(
            velocities.reduce((s, x) => s + (x - mVel) ** 2, 0) / (velocities.length - 1),
          )
        : null
    return {
      nucleus: {
        averageCommitmentCompletionRateLastN: commitRates.length ? meanArr(commitRates) : null,
        averageVelocityLastN: velocities.length ? meanArr(velocities) : null,
        velocityVarianceLastN:
          velocities.length >= 2
            ? Math.round(
                (velocities.reduce((s, x) => s + (x - mVel) ** 2, 0) / (velocities.length - 1)) * 10_000,
              ) / 10_000
            : null,
        averageCarryOverRateLastN: carryRates.length ? meanArr(carryRates) : null,
        velocitySampleStdevLastN: stdevV !== null ? Math.round(stdevV * 10_000) / 10_000 : null,
      },
      velocitySeries: velocities,
      points,
    }
  }

  private weekRange(nWeeks: number, now: Date): { from: string; to: string } {
    const m = startOfUtcWeekMonday(now)
    const from = addUtcDays(m, -7 * (nWeeks - 1))
    return { from: from.toISOString(), to: now.toISOString() }
  }

  private async loadKanbanWeeks(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    kanbanProjectIds: string[],
    lastN: number,
  ): Promise<{
    nucleus: KanbanPredictabilityNucleus
    throughputSeries: number[]
    points: TrendPointKanban[]
    weekKeysOrdered: string[]
  }> {
    const { from, to } = this.weekRange(lastN, this.now())
    const byWeek = new Map<string, number>()
    for (const pid of kanbanProjectIds) {
      const thr = await this.kanbanMetrics.getThroughput(actor, workspacePublicId, pid, { from, to }, this.now())
      for (const w of thr.weeks) {
        byWeek.set(w.weekStart, (byWeek.get(w.weekStart) ?? 0) + w.completedItemsCount)
      }
    }
    const weekKeysOrdered = [...byWeek.keys()].sort()
    const throughputs = weekKeysOrdered.map((k) => byWeek.get(k) ?? 0)
    const m = meanArr(throughputs)
    const varN =
      throughputs.length >= 2
        ? Math.round(
            (throughputs.reduce((s, x) => s + (x - m) ** 2, 0) / (throughputs.length - 1)) * 10_000,
          ) / 10_000
        : null
    const stdev =
      throughputs.length >= 2
        ? Math.sqrt(throughputs.reduce((s, x) => s + (x - m) ** 2, 0) / (throughputs.length - 1))
        : null
    const mWarn =
      kanbanProjectIds.length > 1 ? [DataQualityWarningCode.KANBAN_MULTI_PROJECT_WEEKS] : []
    const points: TrendPointKanban[] = weekKeysOrdered.map((weekStart) => ({
      kind: "kanban_week",
      projectPublicId: kanbanProjectIds.length === 1 ? kanbanProjectIds[0]! : "aggregated",
      weekStart,
      completedItemsCount: byWeek.get(weekStart) ?? 0,
      includedInPredictability: true,
      pointWarnings: mWarn,
    }))
    return {
      nucleus: {
        averageThroughputLastN: throughputs.length ? m : null,
        throughputVarianceLastN: varN,
        sampleStdevLastN: stdev !== null ? Math.round(stdev * 10_000) / 10_000 : null,
      },
      throughputSeries: throughputs,
      points,
      weekKeysOrdered,
    }
  }

  private buildPeriod(lastN: number): PredictabilityPeriod {
    const w = this.weekRange(lastN, this.now())
    return {
      kind: "last_n",
      label: `last_${lastN}_periods`,
      from: w.from,
      to: w.to,
      lastN,
    }
  }

  private resolvePeriodsUsedCount(
    methodology: MethodologyContext,
    scrumCount: number,
    kanbanCount: number,
  ): number {
    if (methodology === "scrum" || methodology === "other" || methodology === "unknown") return scrumCount
    if (methodology === "kanban") return kanbanCount
    if (methodology === "mixed") return Math.max(scrumCount, kanbanCount)
    return 0
  }

  private buildVariation(
    methodology: MethodologyContext,
    velocitySeries: number[],
    throughputSeries: number[],
    periodsUsed: number,
  ): { variation: VariationBlock | null; notes: string | null } {
    if (methodology === "mixed") {
      return {
        variation: null,
        notes:
          "Mixed Scrum/Kanban: no consolidated single variation; use scrum and kanban series separately (velocity vs throughput are not commensurate).",
      }
    }
    if (methodology === "scrum" || methodology === "other") {
      if (velocitySeries.length > 0) {
        return {
          variation: buildVariationBlock(velocitySeries, "scrum_velocity", periodsUsed),
          notes: null,
        }
      }
      return { variation: null, notes: "No closed sprint series with v2 metrics for variation." }
    }
    if (methodology === "kanban") {
      if (throughputSeries.length > 0) {
        return {
          variation: buildVariationBlock(throughputSeries, "kanban_throughput", periodsUsed),
          notes: null,
        }
      }
      return { variation: null, notes: "No weekly throughput series for variation." }
    }
    if (methodology === "unknown") {
      if (velocitySeries.length > 0) {
        return { variation: buildVariationBlock(velocitySeries, "scrum_velocity", periodsUsed), notes: null }
      }
      if (throughputSeries.length > 0) {
        return { variation: buildVariationBlock(throughputSeries, "kanban_throughput", periodsUsed), notes: null }
      }
    }
    return { variation: null, notes: "No series for variation." }
  }

  async getPredictabilitySummary(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string | undefined,
    lastN: number,
    actor: WorkspaceMemberState,
  ): Promise<TeamPredictabilitySummaryJson> {
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    await this.requirePredictabilityTeamReadAccess(actor, workspacePublicId, teamPublicId)
    const pids = await this.resolveProjectIds(workspacePublicId, teamPublicId, projectPublicId)
    const byProject = await this.loadProjectsMeta(workspacePublicId, pids)
    const methodology = loadMethodologyForProjects(byProject, pids)
    const n = Math.min(Math.max(1, lastN || PREDICTABILITY_DEFAULT_LAST_N), 24)
    const warnings: string[] = []
    const notes: string[] = [
      "Predictability v1: on-demand; series from closed sprints (Scrum) with Sprint Metrics v2, or weekly Kanban throughput (UTC Monday buckets).",
      "Readiness uses the count of periods in the dominant stream: mixed uses max(Scrum periods, Kanban weeks).",
    ]
    if (pids.length === 0) warnings.push(DataQualityWarningCode.NO_LINKED_PROJECTS)
    const scrumIds = pids.filter((id) => byProject.get(id)?.operationalApproach === "scrum")
    const kanbanIds = pids.filter((id) => byProject.get(id)?.operationalApproach === "kanban")

    let scrum: ScrumPredictabilityNucleus | null = null
    let velocitySeries: number[] = []
    let kanban: KanbanPredictabilityNucleus | null = null
    let throughputSeries: number[] = []
    let scrumRows: ScrumPeriodRow[] = []
    let kanbanWeeks = 0

    if (scrumIds.length) {
      const { rows, skippedLegacy, hadMultiProject } = await this.loadScrumPeriods(
        workspacePublicId,
        scrumIds,
        n,
      )
      scrumRows = rows
      if (skippedLegacy) warnings.push(DataQualityWarningCode.SPRINT_METRICS_SKIP_LEGACY)
      if (hadMultiProject) warnings.push(DataQualityWarningCode.MULTI_SOURCE_SCRUM)
      const sn = this.scrumNucleusFrom(rows)
      scrum = sn.nucleus
      velocitySeries = sn.velocitySeries
    }
    if (kanbanIds.length) {
      const kn = await this.loadKanbanWeeks(actor, workspacePublicId, kanbanIds, n)
      kanban = kn.nucleus
      throughputSeries = kn.throughputSeries
      kanbanWeeks = kn.weekKeysOrdered.length
    }
    if (methodology === "mixed") {
      warnings.push(DataQualityWarningCode.METHODOLOGY_MIX)
    }

    const periodsUsed = this.resolvePeriodsUsedCount(methodology, scrumRows.length, kanbanWeeks)
    if (periodsUsed < 3) warnings.push(DataQualityWarningCode.INSUFFICIENT_PERIOD_HISTORY)
    else if (periodsUsed < 6) warnings.push(DataQualityWarningCode.LIMITED_PERIOD_HISTORY)

    const readiness = readinessFromPeriodCount(periodsUsed)
    const hasSufficient = hasSufficientDataFromPeriodCount(periodsUsed)

    const v = this.buildVariation(
      methodology,
      velocitySeries,
      throughputSeries,
      periodsUsed,
    )
    if (v.notes) notes.push(v.notes)

    return {
      teamPublicId: team.teamPublicId,
      teamName: team.name,
      teamStatus: team.status,
      teamLeadUserPublicId: team.teamLeadUserPublicId,
      linkedProjectsCount: pids.length,
      linkedProjectPublicIds: pids,
      methodologyContext: methodology,
      lastN: n,
      lastNUsed: periodsUsed,
      periodsUsedCount: periodsUsed,
      readiness,
      hasSufficientData: hasSufficient,
      period: this.buildPeriod(n),
      scrum,
      kanban,
      variation: v.variation,
      dataQualityWarnings: [...new Set(warnings)],
      calculationNotes: notes,
    }
  }

  async getPredictabilityTrend(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string | undefined,
    lastN: number,
    actor: WorkspaceMemberState,
  ): Promise<TeamPredictabilityTrendJson> {
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    await this.requirePredictabilityTeamReadAccess(actor, workspacePublicId, teamPublicId)
    const pids = await this.resolveProjectIds(workspacePublicId, teamPublicId, projectPublicId)
    const byProject = await this.loadProjectsMeta(workspacePublicId, pids)
    const methodology = loadMethodologyForProjects(byProject, pids)
    const n = Math.min(Math.max(1, lastN || PREDICTABILITY_DEFAULT_LAST_N), 24)
    const warnings: string[] = []
    const notes: string[] = ["Points align with the same scoping and lastN as summary."]
    if (pids.length === 0) warnings.push(DataQualityWarningCode.NO_LINKED_PROJECTS)
    const scrumIds = pids.filter((id) => byProject.get(id)?.operationalApproach === "scrum")
    const kanbanIds = pids.filter((id) => byProject.get(id)?.operationalApproach === "kanban")
    if (methodology === "mixed") warnings.push(DataQualityWarningCode.METHODOLOGY_MIX)

    const { rows: sr } = scrumIds.length
      ? await this.loadScrumPeriods(workspacePublicId, scrumIds, n)
      : { rows: [] as ScrumPeriodRow[] }
    const { points: sp } = sr.length ? this.scrumNucleusFrom(sr) : { points: [] as TrendPointScrum[] }
    const knW = kanbanIds.length
      ? await this.loadKanbanWeeks(actor, workspacePublicId, kanbanIds, n)
      : null
    const kp = knW?.points ?? []
    const periodsUsed = this.resolvePeriodsUsedCount(methodology, sr.length, knW?.weekKeysOrdered.length ?? 0)

    return {
      teamPublicId: team.teamPublicId,
      teamName: team.name,
      methodologyContext: methodology,
      lastN: n,
      periodsUsedCount: periodsUsed,
      period: this.buildPeriod(n),
      scrumPoints: sp,
      kanbanPoints: kp,
      dataQualityWarnings: [...new Set(warnings)],
      calculationNotes: notes,
    }
  }

  async listWorkspacePredictabilityTeams(
    workspacePublicId: string,
    options: {
      limit: number
      offset: number
      includeArchived: boolean
      projectPublicIdFilter?: string
      lastN: number
      methodologyFilter?: "scrum" | "kanban"
    },
    actor: WorkspaceMemberState,
  ): Promise<ListTeamPredictabilityResultJson> {
    const baseFilters: ListWorkTeamsFilters = options.includeArchived ? {} : { status: "active" }
    const filters = this.teamListFiltersForActor(actor, baseFilters)
    const { items: teams, totalCount } = await this.teams.list(
      workspacePublicId,
      filters,
      { limit: options.limit, offset: options.offset } as Pagination,
    )

    const out: TeamPredictabilitySummaryJson[] = []
    const meth = { scrum: 0, kanban: 0, other: 0 }
    for (const t of teams) {
      const pids = await this.resolveProjectIds(workspacePublicId, t.teamPublicId, options.projectPublicIdFilter)
      const by = await this.loadProjectsMeta(workspacePublicId, pids)
      const mctx = loadMethodologyForProjects(by, pids)
      if (options.methodologyFilter) {
        const hasS = pids.some((id) => by.get(id)?.operationalApproach === "scrum")
        const hasK = pids.some((id) => by.get(id)?.operationalApproach === "kanban")
        if (options.methodologyFilter === "scrum" && !hasS) continue
        if (options.methodologyFilter === "kanban" && !hasK) continue
      }
      if (mctx === "scrum" || mctx === "mixed") meth.scrum += 1
      if (mctx === "kanban" || mctx === "mixed") meth.kanban += 1
      if (mctx === "other" || mctx === "unknown") meth.other += 1
      out.push(
        await this.getPredictabilitySummary(
          workspacePublicId,
          t.teamPublicId,
          options.projectPublicIdFilter,
          options.lastN,
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
    const top: string[] = []
    if (meth.scrum > 0 && meth.kanban > 0) top.push(DataQualityWarningCode.METHODOLOGY_MIX)
    return {
      items: out,
      totalCount,
      limit: options.limit,
      offset: options.offset,
      methodologyContextWorkspace,
      dataQualityWarnings: top,
      calculationNotes: [
        "Cross-team: same lastN and rules as per-team summary; do not treat Scrum velocity as Kanban throughput.",
      ],
    }
  }
}
