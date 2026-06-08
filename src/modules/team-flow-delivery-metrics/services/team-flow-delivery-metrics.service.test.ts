import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import type { SprintClosureState } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import {
  type WorkTeamMembershipState,
  type WorkTeamProjectLinkState,
  type WorkTeamState,
} from "../../workspace-work-teams/domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { ListWorkTeamsFilters, Pagination, WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { TeamFlowDeliveryMetricsService } from "./team-flow-delivery-metrics.service.js"
import { TeamFlowDeliveryMetricsNotFoundError } from "../domain/team-flow-delivery-metrics.errors.js"
import { DataQualityWarningCode, FlowFrictionCode } from "../domain/team-flow-delivery-metrics.constants.js"

const WS = "a1000000-0000-4000-8000-000000000001"
const TEAM = "a2000000-0000-4000-8000-000000000002"
const PROJ = "a3000000-0000-4000-8000-000000000003"
const PROJ_K = "a4000000-0000-4000-8000-000000000004"
const U1 = "b1000000-0000-4000-8000-000000000011"
/** Segundo equipo solo Kanban, para filtro de comparativa. */
const TEAM_KAN = "a2000000-0000-4000-8000-0000000000bb"

function project(op: "scrum" | "kanban", id: string): WorkspaceRuntimeProjectState {
  const now = new Date(0)
  return {
    projectPublicId: id,
    workspacePublicId: WS,
    sourceDraftPublicId: "d-1",
    projectName: "P",
    operationalApproach: op,
    initialConfigurationSummary: defaultInitialConfigurationSummary(op),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function backlogItem(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date(0)
  return {
    backlogItemPublicId: randomUUID(),
    workspacePublicId: WS,
    projectPublicId: PROJ,
    itemType: "user_story",
    title: "T",
    description: "",
    status: "open",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: U1,
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: U1,
    assignmentUpdatedAt: now,
    assignmentUpdatedByUserPublicId: U1,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "none",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
    ...over,
  }
}

class MemTeam implements WorkTeamRepository {
  rows: WorkTeamState[] = []
  memLookup: MemMemberships | null = null
  async insert() {
    return
  }
  async findByTeamPublicId(
    workspacePublicId: string,
    teamPublicId: string,
  ): Promise<WorkTeamState | null> {
    return this.rows.find((r) => r.workspacePublicId === workspacePublicId && r.teamPublicId === teamPublicId) ?? null
  }
  async findByWorkspaceAndNameNormalized() {
    return null
  }
  async list(
    workspacePublicId: string,
    filters: ListWorkTeamsFilters,
    pagination: Pagination,
  ): Promise<{ items: WorkTeamState[]; totalCount: number }> {
    let list = this.rows.filter((r) => r.workspacePublicId === workspacePublicId)
    if (filters.memberUserPublicId && this.memLookup) {
      const allow = new Set(
        this.memLookup.rows
          .filter(
            (m) =>
              m.workspacePublicId === workspacePublicId &&
              m.userPublicId === filters.memberUserPublicId &&
              m.isActive !== false,
          )
          .map((m) => m.teamPublicId),
      )
      if (allow.size === 0) {
        return { items: [], totalCount: 0 }
      }
      list = list.filter((r) => allow.has(r.teamPublicId))
    }
    if (filters.status) list = list.filter((r) => r.status === filters.status)
    return { items: list.slice(pagination.offset, pagination.offset + pagination.limit), totalCount: list.length }
  }
  async update() {
    return null
  }
}

function flowMembershipRow(userPublicId: string, teamPublicId: string): WorkTeamMembershipState {
  const now = new Date(0)
  return {
    teamMembershipPublicId: randomUUID(),
    workspacePublicId: WS,
    teamPublicId,
    userPublicId,
    joinedAt: now,
    leftAt: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}

class MemMemberships implements WorkTeamMembershipRepository {
  rows: WorkTeamMembershipState[] = []
  async insert() {
    return
  }
  async listActiveTeamPublicIdsForUserInWorkspace(workspacePublicId: string, userPublicId: string) {
    const ids = this.rows
      .filter(
        (m) =>
          m.workspacePublicId === workspacePublicId &&
          m.userPublicId === userPublicId &&
          m.isActive !== false,
      )
      .map((m) => m.teamPublicId)
    return [...new Set(ids)].sort()
  }
  async findActiveByTeamAndUser(teamPublicId: string, userPublicId: string) {
    return (
      this.rows.find(
        (m) =>
          m.teamPublicId === teamPublicId &&
          m.userPublicId === userPublicId &&
          m.isActive !== false,
      ) ?? null
    )
  }
  async listByTeam(teamPublicId: string, options: { activeOnly: boolean; workspacePublicId?: string }) {
    return this.rows.filter((m) => {
      if (m.teamPublicId !== teamPublicId) return false
      if (options.workspacePublicId && m.workspacePublicId !== options.workspacePublicId) return false
      if (options.activeOnly && m.isActive === false) return false
      return true
    })
  }
  async softDeactivate() {
    return null
  }
}

class MemLinks implements WorkTeamProjectLinkRepository {
  rows: WorkTeamProjectLinkState[] = []
  async insert() {
    return
  }
  async deleteByTeamAndProject() {
    return true
  }
  async listByTeam(workspacePublicId: string, teamPublicId: string) {
    return this.rows.filter((l) => l.workspacePublicId === workspacePublicId && l.teamPublicId === teamPublicId)
  }
  async listByProject() {
    return []
  }
  async findByTeamAndProject() {
    return null
  }
}

class MemBacklog implements ScrumBacklogRepository {
  items: ScrumBacklogItemState[] = []
  keyRow(it: ScrumBacklogItemState) {
    return `${it.workspacePublicId}::${it.projectPublicId}::${it.backlogItemPublicId}`
  }
  async insert() {
    return
  }
  async replace(s: ScrumBacklogItemState) {
    const i = this.items.findIndex((x) => this.keyRow(x) === this.keyRow(s))
    if (i >= 0) this.items[i] = s
  }
  async findByProjectAndItemId() {
    return null
  }
  async listByProject(workspacePublicId: string, projectPublicId: string) {
    return this.items.filter((i) => i.workspacePublicId === workspacePublicId && i.projectPublicId === projectPublicId)
  }
  async maxSortOrderAmongSiblings() {
    return 0
  }
  async bulkSetSortOrders() {
    return
  }
  async pushAssignmentEventAndSetAssignee() {
    return null
  }
  async adjustCommentsCount() {
    return false
  }
  async listKanbanBacklogItems() {
    return []
  }
  async countItemsInKanbanColumn() {
    return 0
  }
  async maxSortOrderKanbanBacklog() {
    return 0
  }
  async minSortOrderKanbanBacklog() {
    return null
  }
  async listKanbanBoardItems() {
    return []
  }
}

class MemRuntime implements ProjectRuntimeRepository {
  byId = new Map<string, WorkspaceRuntimeProjectState>()
  async insert() {
    return
  }
  async findByWorkspaceAndProjectPublicId(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<WorkspaceRuntimeProjectState | null> {
    return this.byId.get(`${workspacePublicId}::${projectPublicId}`) ?? null
  }
  async findByWorkspaceAndSourceDraftPublicId() {
    return null
  }
  async listByWorkspacePublicId() {
    return []
  }
}

class MemSprint implements Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> {
  sprints: ScrumSprintState[] = []
  async listSprintsByProject(_ws: string, _pid: string) {
    return this.sprints
  }
}

function closedSprint(projectPublicId: string, id: string, closed: Date): ScrumSprintState {
  const closure: SprintClosureState = {
    closedAt: closed,
    closedByUserPublicId: U1,
    closureNote: "",
    goalAchieved: true,
    sprintGoalAtClosure: "G",
    items: [],
  }
  return {
    sprintPublicId: id,
    workspacePublicId: WS,
    projectPublicId,
    name: "S1",
    goal: "g",
    status: "closed",
    startDate: new Date(closed.getTime() - 7 * 86_400_000),
    endDate: closed,
    createdByUserPublicId: U1,
    createdAt: closed,
    updatedAt: closed,
    closure,
    review: null,
    retrospective: null,
  }
}

function teamA(): WorkTeamState {
  const now = new Date(0)
  return {
    teamPublicId: TEAM,
    workspacePublicId: WS,
    name: "Squad",
    nameNormalized: "squad",
    description: null,
    status: "active",
    teamLeadUserPublicId: U1,
    targetSize: 5,
    createdAt: now,
    updatedAt: now,
  }
}

function link(t: string, p: string): WorkTeamProjectLinkState {
  const now = new Date(0)
  return {
    teamProjectLinkPublicId: randomUUID(),
    workspacePublicId: WS,
    teamPublicId: t,
    projectPublicId: p,
    createdAt: now,
    updatedAt: now,
  }
}

describe("team-flow-delivery-metrics.service", () => {
  let teams: MemTeam
  let mems: MemMemberships
  let links: MemLinks
  let backlog: MemBacklog
  let runtime: MemRuntime
  let memSprint: MemSprint
  let mockSprintMetrics: { get: ReturnType<typeof getBasic> }
  const fixedNow = new Date("2024-01-10T12:00:00.000Z")
  const tInside = new Date("2024-01-08T00:00:00.000Z")
  const tOld = new Date("2020-01-01T00:00:00.000Z")

  function getBasic() {
    return {
      getBasicSprintMetrics: async () => ({
        committedItemsCount: 10,
        notCompletedItemsCount: 2,
        completedItemsCount: 8,
        sprintPublicId: "sp-1",
        projectPublicId: PROJ,
        workspacePublicId: WS,
        status: "closed" as const,
        goalAchieved: true,
        goalAtClosure: "g",
        closedAt: fixedNow.toISOString(),
        completionPercentage: 80,
        finalBoardDistribution: { to_do: 0, in_progress: 0, in_review: 0, done: 0 },
        plannedDurationDays: 7,
        metricsSchemaVersion: 2 as const,
        committedStoryPoints: 5,
        completedStoryPoints: 4,
        notCompletedStoryPoints: 1,
        completionPercentageByStoryPoints: 80,
        estimatedCommittedItemsCount: 8,
        unestimatedCommittedItemsCount: 2,
        itemsWithPendingAcceptanceCriteriaCount: 0,
        itemsWithNotFullyReviewedAcceptanceCriteriaCount: 0,
        carryoverItemsCount: 1,
        carryoverStoryPoints: 1,
      }),
    } as unknown as SprintMetricsService
  }

  beforeEach(() => {
    teams = new MemTeam()
    mems = new MemMemberships()
    mems.rows = [flowMembershipRow("u-test", TEAM)]
    teams.memLookup = mems
    links = new MemLinks()
    backlog = new MemBacklog()
    runtime = new MemRuntime()
    memSprint = new MemSprint()
    mockSprintMetrics = { get: getBasic() }
  })

  it("getFlowSummary: throughput, unassigned, old active, not found", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    memSprint.sprints = [closedSprint(PROJ, "sp-1", fixedNow)]
    backlog.items.push(
      backlogItem({ status: "done", updatedAt: tInside, projectPublicId: PROJ }),
    )
    backlog.items.push(
      backlogItem({
        status: "open",
        projectPublicId: PROJ,
        assignedUserPublicId: null,
        createdAt: tInside,
        updatedAt: tInside,
      }),
    )
    backlog.items.push(
      backlogItem({
        status: "in_progress",
        projectPublicId: PROJ,
        createdAt: tOld,
        updatedAt: tInside,
      }),
    )
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, tInside.toISOString(), fixedNow.toISOString(), sm)
    assert.equal(s.throughputLastPeriod, 1)
    assert.equal(s.unassignedWorkItemsCount, 1)
    assert.equal(s.oldActiveWorkItemsCount, 1)
    assert(s.carryOverRate !== null && s.carryOverRate > 0)
    assert(s.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX) === false)
    const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
    const s2 = await svc.getFlowSummary(WS, TEAM, undefined, tInside.toISOString(), fixedNow.toISOString(), dev)
    assert.equal(s2.reassignmentEventCountInPeriod, null)
    assert(s2.dataQualityWarnings.includes(DataQualityWarningCode.ASSIGNMENT_QUALITY_NOT_VISIBLE))
    await assert.rejects(
      () => svc.getFlowSummary(WS, "a9000000-0000-4000-8000-000000000099", undefined, undefined, undefined, sm),
      (e) => e instanceof TeamFlowDeliveryMetricsNotFoundError,
    )
  })

  it("getFlowSummary: no linked projects", async () => {
    teams.rows.push(teamA())
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, undefined, undefined, sm)
    assert.equal(s.linkedProjectsCount, 0)
    assert.equal(s.hasSufficientData, false)
    assert(s.dataQualityWarnings.includes(DataQualityWarningCode.NO_LINKED_PROJECTS))
  })

  it("getFlowSummary: mixed methodology warning", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ), link(TEAM, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, undefined, undefined, sm)
    assert.equal(s.methodologyContext, "mixed")
    assert(s.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX))
  })

  it("getFlowSummary: assignment history in window", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const ev1 = {
      assignmentEventId: "e1",
      changedAt: tInside,
      changedByUserPublicId: U1,
      previousAssignedUserPublicId: null,
      newAssignedUserPublicId: U1,
      changeType: "self_assigned" as const,
    }
    const ev2 = {
      ...ev1,
      assignmentEventId: "e2",
      changedAt: new Date(tInside.getTime() + 1000),
      previousAssignedUserPublicId: U1,
      newAssignedUserPublicId: "b2000000-0000-4000-8000-000000000022",
      changeType: "reassigned" as const,
    }
    backlog.items.push(
      backlogItem({ assignmentHistory: [ev1, ev2], status: "open", projectPublicId: PROJ, createdAt: tOld, updatedAt: tInside }),
    )
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, tInside.toISOString(), fixedNow.toISOString(), sm)
    assert.equal(s.reassignmentEventCountInPeriod! >= 1, true)
  })

  it("getFlowSummary: Kanban-only null carry and SCRUM_CARRY_NOT_APPLICABLE", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    backlog.items.push(backlogItem({ projectPublicId: PROJ_K, status: "open" }))
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, undefined, undefined, sm)
    assert.equal(s.carryOverRate, null)
    assert.equal(s.methodologyContext, "kanban")
    assert(s.dataQualityWarnings.includes(DataQualityWarningCode.SCRUM_CARRY_NOT_APPLICABLE))
  })

  it("getFlowSummary: elevated unassigned friction when ratio is high", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    for (let i = 0; i < 3; i++) {
      backlog.items.push(
        backlogItem({
          backlogItemPublicId: randomUUID(),
          projectPublicId: PROJ,
          status: "open",
          assignedUserPublicId: null,
        }),
      )
    }
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, undefined, undefined, sm)
    assert(s.flowFrictionSignalCodes.includes(FlowFrictionCode.ELEVATED_UNASSIGNED))
    assert(s.dataQualityWarnings.includes(DataQualityWarningCode.INSUFFICIENT_ASSIGNMENT_COVERAGE))
  })

  it("getFlowSummary: first-assignment average when history has explicit first assign", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const dayMs = 86_400_000
    const c = new Date(fixedNow.getTime() - 3 * dayMs)
    const firstAt = new Date(c.getTime() + 1 * dayMs)
    const ev1 = {
      assignmentEventId: "e1",
      changedAt: firstAt,
      changedByUserPublicId: U1,
      previousAssignedUserPublicId: null,
      newAssignedUserPublicId: U1,
      changeType: "assigned" as const,
    }
    backlog.items.push(
      backlogItem({
        status: "done",
        projectPublicId: PROJ,
        createdAt: c,
        updatedAt: tInside,
        assignedUserPublicId: U1,
        assignmentHistory: [ev1],
      }),
    )
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const s = await svc.getFlowSummary(WS, TEAM, undefined, tInside.toISOString(), fixedNow.toISOString(), sm)
    assert(s.averageTimeToFirstAssignmentDays !== null)
    assert.equal(s.averageTimeToFirstAssignmentDays, 1)
  })

  it("listWorkspaceFlowTeams: workspace methodology mix flag", async () => {
    const teamB = "a3000000-0000-4000-8000-000000000099"
    mems.rows = [flowMembershipRow("u-test", TEAM), flowMembershipRow("u-test", teamB)]
    teams.rows.push(teamA(), {
      ...teamA(),
      teamPublicId: teamB,
      name: "B",
    })
    links.rows = [link(TEAM, PROJ), link(teamB, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const r = await svc.listWorkspaceFlowTeams(WS, { limit: 20, offset: 0, includeArchived: false }, sm)
    assert(r.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX) === true)
  })

  it("listWorkspaceFlowTeams: methodology=scrum excludes kanban-only team", async () => {
    mems.rows = [flowMembershipRow("u-test", TEAM), flowMembershipRow("u-test", TEAM_KAN)]
    teams.rows.push(teamA(), {
      ...teamA(),
      teamPublicId: TEAM_KAN,
      name: "Solo Kanban",
    })
    links.rows = [link(TEAM, PROJ), link(TEAM_KAN, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
    const r = await svc.listWorkspaceFlowTeams(
      WS,
      { limit: 20, offset: 0, includeArchived: false, methodologyFilter: "scrum" },
      sm,
    )
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0]!.teamPublicId, TEAM)
  })

  it("getFlowSummary: product_owner without team membership yields not found", async () => {
    teams.rows.push(teamA())
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const svc = new TeamFlowDeliveryMetricsService(
      teams,
      mems,
      links,
      backlog,
      runtime,
      memSprint as unknown as ScrumSprintPlanningRepository,
      mockSprintMetrics.get,
      () => fixedNow,
    )
    const po = minimalWorkspaceMember({
      workspaceRoleMethodological: "product_owner",
      userPublicId: "po-orphan",
    })
    await assert.rejects(
      () => svc.getFlowSummary(WS, TEAM, undefined, undefined, undefined, po),
      (e) => e instanceof TeamFlowDeliveryMetricsNotFoundError,
    )
  })
})
