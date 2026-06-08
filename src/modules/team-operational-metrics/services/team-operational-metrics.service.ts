import type { ImpedimentRepository } from "../../project-impediments/persistence/impediment.repository.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogItemType } from "../../project-scrum-backlog/domain/backlog-item-type.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkTeamMembershipState } from "../../workspace-work-teams/domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { ListWorkTeamsFilters, WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { operationalProjectListingIsWorkspaceWide } from "../../workspace-project-runtime/policies/operational-project-listing-scope.policy.js"
import { actorMayReadWorkTeamOperationalSurface } from "../../workspace-project-runtime/policies/operational-work-team-read-access.js"
import { TeamOperationalMetricsNotFoundError } from "../domain/team-operational-metrics.errors.js"
import type { MethodologyContext } from "../domain/team-operational-metrics.dto.js"
import { IMPEDIMENT_ACTIVE_STATUSES, OPERATIONAL_UNASSIGNED_RATIO_WARN } from "../domain/team-operational-metrics.constants.js"
import {
  toSummaryJson,
  toMemberRowJson,
  toListResultJson,
  type WorkItemAggregate,
  type PerUserAggregate,
} from "./team-operational-metrics.aggregation.js"

const EPIC: ScrumBacklogItemType = "epic"

function isWorkloadItemType(t: ScrumBacklogItemType): boolean {
  return t !== EPIC
}

function isActiveItem(it: ScrumBacklogItemState): boolean {
  return (it.status === "open" || it.status === "in_progress") && isWorkloadItemType(it.itemType)
}

/**
 * Cálculo on-demand. Evolución futura: caché / preagregación.
 */
export class TeamOperationalMetricsService {
  constructor(
    private readonly teams: WorkTeamRepository,
    private readonly memberships: WorkTeamMembershipRepository,
    private readonly projectLinks: WorkTeamProjectLinkRepository,
    private readonly backlog: ScrumBacklogRepository,
    private readonly impediments: ImpedimentRepository,
    private readonly projectRuntime: ProjectRuntimeRepository,
    private readonly workspaceUserService: WorkspaceUserService,
  ) {}

  private async requireTeam(workspacePublicId: string, teamPublicId: string) {
    const team = await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)
    if (!team) throw new TeamOperationalMetricsNotFoundError()
    return team
  }

  private teamListFiltersForActor(actor: WorkspaceMemberState, base: ListWorkTeamsFilters): ListWorkTeamsFilters {
    if (operationalProjectListingIsWorkspaceWide(actor)) {
      return base
    }
    return { ...base, memberUserPublicId: actor.userPublicId }
  }

  private async requireTeamMetricsReadAccess(
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
      throw new TeamOperationalMetricsNotFoundError()
    }
  }

  private async activeMembers(
    teamPublicId: string,
  ): Promise<{ rows: WorkTeamMembershipState[]; count: number }> {
    const mems = await this.memberships.listByTeam(teamPublicId, { activeOnly: true })
    return { rows: mems, count: mems.length }
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
  ): Promise<{
    methodology: MethodologyContext
    byProject: Map<string, WorkspaceRuntimeProjectState>
  }> {
    const byProject = new Map<string, WorkspaceRuntimeProjectState>()
    const flags = { scrum: 0, kanban: 0, other: 0 }
    for (const pid of projectIds) {
      const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, pid)
      if (p) {
        byProject.set(pid, p)
        if (p.operationalApproach === "scrum") flags.scrum += 1
        else if (p.operationalApproach === "kanban") flags.kanban += 1
        else flags.other += 1
      }
    }
    let methodology: MethodologyContext = "unknown"
    if (flags.scrum > 0 && flags.kanban > 0) methodology = "mixed"
    else if (flags.scrum > 0) methodology = "scrum"
    else if (flags.kanban > 0) methodology = "kanban"
    else if (flags.other > 0) methodology = "other"
    return { methodology, byProject }
  }

  private async aggregateAllItems(
    workspacePublicId: string,
    projectIds: string[],
  ): Promise<{
    work: WorkItemAggregate
    byUser: Map<string, PerUserAggregate>
    assigneeByItemId: Map<string, string | null>
  }> {
    let totalAssigned = 0
    let totalUnassigned = 0
    let blocked = 0
    const byUser = new Map<string, PerUserAggregate>()
    const assigneeByItemId = new Map<string, string | null>()

    for (const pid of projectIds) {
      const items = await this.backlog.listByProject(workspacePublicId, pid)
      for (const it of items) {
        if (!isActiveItem(it)) continue
        assigneeByItemId.set(it.backlogItemPublicId, it.assignedUserPublicId)
        if (it.assignedUserPublicId) {
          totalAssigned += 1
        } else {
          totalUnassigned += 1
        }
        if (it.isBlocked) blocked += 1
        if (it.assignedUserPublicId) {
          const u = it.assignedUserPublicId
          if (!byUser.has(u)) {
            byUser.set(u, { active: 0, inProgress: 0, blocked: 0, agingMsSum: 0, agingCount: 0 })
          }
          const row = byUser.get(u)!
          row.active += 1
          if (it.status === "in_progress") row.inProgress += 1
          if (it.isBlocked) row.blocked += 1
          row.agingMsSum += Date.now() - it.createdAt.getTime()
          row.agingCount += 1
        }
      }
    }

    return {
      work: {
        totalAssigned,
        totalUnassigned,
        blocked,
        totalActive: totalAssigned + totalUnassigned,
      },
      byUser,
      assigneeByItemId,
    }
  }

  async getTeamMetricsSummary(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicIdFilter: string | undefined,
  ) {
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    await this.requireTeamMetricsReadAccess(actor, workspacePublicId, teamPublicId)
    const { count: activeMembersCount } = await this.activeMembers(teamPublicId)
    const projectIds = await this.resolveProjectIds(workspacePublicId, teamPublicId, projectPublicIdFilter)
    const { methodology } = await this.loadProjectsMeta(workspacePublicId, projectIds)

    const { work } = await this.aggregateAllItems(workspacePublicId, projectIds)
    const im = await this.countImpedimentsForProjectsWithMap(
      workspacePublicId,
      projectIds,
    )

    return toSummaryJson({
      team,
      activeMembersCount,
      projectIds,
      work,
      methodology,
      impedOpen: im.open,
      impedCritical: im.criticalOpen,
    })
  }

  private async countImpedimentsForProjectsWithMap(
    workspacePublicId: string,
    projectIds: string[],
  ): Promise<{
    open: number
    criticalOpen: number
  }> {
    let open = 0
    let critical = 0
    for (const pid of projectIds) {
      const r = await this.impediments.listByProject(
        workspacePublicId,
        pid,
        { status: [...IMPEDIMENT_ACTIVE_STATUSES] },
        { limit: 20_000, offset: 0 },
      )
      for (const im of r.items) {
        open += 1
        if (im.severity === "critical") critical += 1
      }
    }
    return { open, criticalOpen: critical }
  }

  async getTeamMemberBreakdown(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicIdFilter: string | undefined,
  ) {
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    await this.requireTeamMetricsReadAccess(actor, workspacePublicId, teamPublicId)
    const { rows: members } = await this.activeMembers(teamPublicId)
    const projectIds = await this.resolveProjectIds(workspacePublicId, teamPublicId, projectPublicIdFilter)
    const allMembers = await this.workspaceUserService.listMembers(workspacePublicId)
    const nameBy = new Map(allMembers.map((m) => [m.userPublicId, m.fullName] as const))

    if (projectIds.length === 0) {
      const rows = members.map((m) =>
        toMemberRowJson({
          userPublicId: m.userPublicId,
          fullName: nameBy.get(m.userPublicId) ?? m.userPublicId,
          active: 0,
          inProgress: 0,
          blocked: 0,
          openImpediments: 0,
          averageAgingDays: null,
          teamActiveTotal: 0,
          hasSufficientData: false,
        }),
      )
      return {
        teamPublicId: team.teamPublicId,
        members: rows,
        dataQualityWarnings: ["no_linked_projects"],
      }
    }

    const { work, byUser } = await this.aggregateAllItems(workspacePublicId, projectIds)
    const imCountsByUser = await this.impedimentOpenCountsByAssignee(workspacePublicId, projectIds)

    const teamActiveTotal = work.totalAssigned
    const rows = []
    for (const m of members) {
      const uid = m.userPublicId
      const uagg = byUser.get(uid) ?? {
        active: 0,
        inProgress: 0,
        blocked: 0,
        agingMsSum: 0,
        agingCount: 0,
      }
      const openImp = imCountsByUser.get(uid) ?? 0
      const aging =
        uagg.agingCount > 0
          ? Math.round((uagg.agingMsSum / uagg.agingCount / 86_400_000) * 10) / 10
          : null
      rows.push(
        toMemberRowJson({
          userPublicId: uid,
          fullName: nameBy.get(uid) ?? uid,
          active: uagg.active,
          inProgress: uagg.inProgress,
          blocked: uagg.blocked,
          openImpediments: openImp,
          averageAgingDays: aging,
          teamActiveTotal,
        }),
      )
    }

    return {
      teamPublicId: team.teamPublicId,
      members: rows,
      dataQualityWarnings: buildWarnings(work, projectIds.length),
    }
  }

  private async impedimentOpenCountsByAssignee(
    workspacePublicId: string,
    projectIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>()
    for (const pid of projectIds) {
      const r = await this.impediments.listByProject(
        workspacePublicId,
        pid,
        { status: [...IMPEDIMENT_ACTIVE_STATUSES] },
        { limit: 20_000, offset: 0 },
      )
      for (const im of r.items) {
        if (!im.relatedWorkItemPublicId) continue
        const item = await this.backlog.findByProjectAndItemId(
          workspacePublicId,
          pid,
          im.relatedWorkItemPublicId,
        )
        const assignee = item?.assignedUserPublicId
        if (!assignee) continue
        map.set(assignee, (map.get(assignee) ?? 0) + 1)
      }
    }
    return map
  }

  async listWorkspaceTeamsMetrics(
    workspacePublicId: string,
    options: { limit: number; offset: number; includeArchived: boolean; projectPublicIdFilter?: string },
    actor: WorkspaceMemberState,
  ) {
    const baseFilters: ListWorkTeamsFilters = options.includeArchived ? {} : { status: "active" }
    const filters = this.teamListFiltersForActor(actor, baseFilters)
    const { items: teams, totalCount } = await this.teams.list(
      workspacePublicId,
      filters,
      { limit: options.limit, offset: options.offset },
    )

    const out: Awaited<ReturnType<typeof toListResultJson>>["items"] = []
    const methFlags = { scrum: 0, kanban: 0, other: 0 }
    const calcNotes: string[] = [
      "Cross-team list uses the same v1 item definitions as team summary: non-epic backlog items in open|in_progress; impediment counts are open+in_review+mitigating per linked project.",
    ]
    for (const t of teams) {
      const projectIds = await this.resolveProjectIds(workspacePublicId, t.teamPublicId, options.projectPublicIdFilter)
      const { count: memberCount } = await this.activeMembers(t.teamPublicId)
      const { methodology } = await this.loadProjectsMeta(workspacePublicId, projectIds)
      if (methodology === "scrum" || methodology === "mixed") methFlags.scrum += 1
      if (methodology === "kanban" || methodology === "mixed") methFlags.kanban += 1
      if (methodology === "other" || methodology === "unknown") methFlags.other += 1
      const { work } = await this.aggregateAllItems(workspacePublicId, projectIds)
      const im = await this.countImpedimentsForProjectsWithMap(workspacePublicId, projectIds)
      out.push(
        toSummaryJson({
          team: t,
          activeMembersCount: memberCount,
          projectIds,
          work,
          methodology,
          impedOpen: im.open,
          impedCritical: im.criticalOpen,
        }),
      )
    }
    const methodologyContextWorkspace: MethodologyContext =
      methFlags.scrum > 0 && methFlags.kanban > 0
        ? "mixed"
        : methFlags.scrum > 0
          ? "scrum"
          : methFlags.kanban > 0
            ? "kanban"
            : "unknown"

    return toListResultJson({
      items: out,
      totalCount,
      limit: options.limit,
      offset: options.offset,
      methodologyContextWorkspace,
      dataQualityWarnings:
        methFlags.scrum > 0 && methFlags.kanban > 0
          ? ["workspace_teams_mixed_methodology: compare throughput or sprint metrics only within the same operational approach"]
          : [],
      calculationNotes: calcNotes,
    })
  }
}

function buildWarnings(work: WorkItemAggregate, linkedProjectsCount: number): string[] {
  const w: string[] = []
  if (linkedProjectsCount === 0) w.push("no_linked_projects")
  const t = work.totalUnassigned + work.totalAssigned
  if (t > 0 && work.totalUnassigned / t >= OPERATIONAL_UNASSIGNED_RATIO_WARN) {
    w.push("high_unassigned_ratio: member-level balance may be misleading")
  }
  if (t === 0) w.push("no_active_work_items_in_scope")
  return w
}
