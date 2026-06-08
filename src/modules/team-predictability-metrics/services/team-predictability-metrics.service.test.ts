import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import type { SprintClosureState } from "../../project-scrum-sprint-planning/domain/sprint-closure.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { SprintMetricsService } from "../../project-scrum-sprint-metrics/services/sprint-metrics.service.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import { type WorkTeamMembershipState, type WorkTeamProjectLinkState, type WorkTeamState } from "../../workspace-work-teams/domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { ListWorkTeamsFilters, Pagination, WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { KanbanMetricsService, KanbanThroughputResponseDto } from "../../project-kanban-metrics/services/kanban-metrics.service.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { PREDICTABILITY_DEFAULT_LAST_N } from "../domain/team-predictability-metrics.constants.js"
import { DataQualityWarningCode } from "../domain/team-predictability-metrics.constants.js"
import { TeamPredictabilityMetricsNotFoundError } from "../domain/team-predictability-metrics.errors.js"
import { TeamPredictabilityMetricsService } from "./team-predictability-metrics.service.js"

const WS = "a1000000-0000-4000-8000-000000000001"
const TEAM = "a2000000-0000-4000-8000-000000000002"
const PROJ = "a3000000-0000-4000-8000-000000000003"
const PROJ_K = "a4000000-0000-4000-8000-000000000004"
const U1 = "b1000000-0000-4000-8000-000000000011"
const OTHER_TEAM = "a2000000-0000-4000-8000-0000000000cc"

const actor = minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })
const smActor = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
const devActor = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })

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

function predMembership(userPublicId: string, teamPublicId: string): WorkTeamMembershipState {
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

function teamState(id: string): WorkTeamState {
  const now = new Date(0)
  return {
    teamPublicId: id,
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

function basicSprintMetrics(sprintId: string, sp: number) {
  return {
    committedItemsCount: 10,
    notCompletedItemsCount: 1,
    completedItemsCount: 9,
    sprintPublicId: sprintId,
    projectPublicId: PROJ,
    workspacePublicId: WS,
    status: "closed" as const,
    goalAchieved: true,
    goalAtClosure: "g",
    closedAt: new Date().toISOString(),
    completionPercentage: 90,
    finalBoardDistribution: { to_do: 0, in_progress: 0, in_review: 0, done: 0 },
    plannedDurationDays: 7,
    metricsSchemaVersion: 2 as const,
    committedStoryPoints: 5,
    completedStoryPoints: sp,
    notCompletedStoryPoints: 0,
    completionPercentageByStoryPoints: 100,
    estimatedCommittedItemsCount: 8,
    unestimatedCommittedItemsCount: 2,
    itemsWithPendingAcceptanceCriteriaCount: 0,
    itemsWithNotFullyReviewedAcceptanceCriteriaCount: 0,
    carryoverItemsCount: 0,
    carryoverStoryPoints: 0,
  }
}

function mockSprintService(): Pick<SprintMetricsService, "getBasicSprintMetrics"> {
  return {
    getBasicSprintMetrics: async () => basicSprintMetrics("sp-1", 4),
  }
}

const baseWeeks = (n: number, val: number): KanbanThroughputResponseDto => ({
  from: "2020-01-01T00:00:00.000Z",
  to: "2020-12-31T00:00:00.000Z",
  terminalColumnPublicId: "t1",
  weeks: Array.from({ length: n }, (_, i) => ({
    weekStart: new Date(Date.UTC(2024, 0, 1 + i * 7)).toISOString(),
    completedItemsCount: val,
  })),
  leadTimeFromFlowEntry: { basedOnAudit: false, sampleCount: 0, medianDays: null, notes: "" },
})

function mockKanban(weeks: KanbanThroughputResponseDto): Pick<KanbanMetricsService, "getThroughput"> {
  return {
    getThroughput: async () => weeks,
  }
}

describe("team-predictability-metrics.service", () => {
  let teams: MemTeam
  let mems: MemMemberships
  let links: MemLinks
  let runtime: MemRuntime
  let memSprint: MemSprint
  const fixedBase = new Date("2024-01-20T12:00:00.000Z")

  beforeEach(() => {
    teams = new MemTeam()
    mems = new MemMemberships()
    mems.rows = [predMembership("u-test", TEAM)]
    teams.memLookup = mems
    links = new MemLinks()
    runtime = new MemRuntime()
    memSprint = new MemSprint()
  })

  it("getPredictabilitySummary: not found", async () => {
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      mockSprintService() as SprintMetricsService,
      mockKanban(baseWeeks(6, 3)) as KanbanMetricsService,
      () => fixedBase,
    )
    await assert.rejects(
      () => svc.getPredictabilitySummary(WS, TEAM, undefined, 6, actor),
      (e) => e instanceof TeamPredictabilityMetricsNotFoundError,
    )
  })

  it("getPredictabilitySummary: Scrum, lastN defaults to 6, readiness and variation when 6+ periods", async () => {
    teams.rows.push(teamState(TEAM))
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const t0 = new Date("2024-01-10T00:00:00.000Z")
    memSprint.sprints = Array.from({ length: 6 }, (_, i) => closedSprint(PROJ, `s-${i}`, new Date(t0.getTime() - i * 86_400_000 * 8)))

    const dynamicSm: Pick<SprintMetricsService, "getBasicSprintMetrics"> = {
      getBasicSprintMetrics: async (_w, _p, sid) => basicSprintMetrics(sid, 4 + (sid === "s-0" ? 6 : 0)),
    }
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      dynamicSm as SprintMetricsService,
      mockKanban(baseWeeks(0, 0)) as KanbanMetricsService,
      () => t0,
    )
    const r = await svc.getPredictabilitySummary(WS, TEAM, undefined, PREDICTABILITY_DEFAULT_LAST_N, smActor)
    assert.equal(r.methodologyContext, "scrum")
    assert.equal(r.readiness, "adequate")
    assert.equal(r.hasSufficientData, true)
    assert.equal(r.lastN, 6)
    assert.equal(r.periodsUsedCount, 6)
    assert(r.variation && r.variation.variationSignalLevel !== "indeterminate")
    assert(r.scrum?.averageVelocityLastN != null)
    assert(!r.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX))
  })

  it("getPredictabilitySummary: insufficient periods (2 sprints) -> readiness insufficient, hasSufficientData false", async () => {
    teams.rows.push(teamState(TEAM))
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const t0 = new Date("2024-01-10T00:00:00.000Z")
    memSprint.sprints = [closedSprint(PROJ, "s-0", t0), closedSprint(PROJ, "s-1", new Date(t0.getTime() - 86_400_000 * 10))]
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      mockSprintService() as SprintMetricsService,
      mockKanban(baseWeeks(0, 0)) as KanbanMetricsService,
      () => t0,
    )
    const r = await svc.getPredictabilitySummary(WS, TEAM, undefined, 6, devActor)
    assert.equal(r.readiness, "insufficient")
    assert.equal(r.hasSufficientData, false)
    assert(r.dataQualityWarnings.includes(DataQualityWarningCode.INSUFFICIENT_PERIOD_HISTORY))
  })

  it("getPredictabilitySummary: mixed scrum+kanban -> no consolidated variation, methodology mix", async () => {
    teams.rows.push(teamState(TEAM))
    links.rows = [link(TEAM, PROJ), link(TEAM, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const t0 = new Date("2024-01-10T00:00:00.000Z")
    memSprint.sprints = Array.from({ length: 2 }, (_, i) => closedSprint(PROJ, `sx-${i}`, new Date(t0.getTime() - i * 86_400_000 * 8)))
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      mockSprintService() as SprintMetricsService,
      mockKanban(baseWeeks(6, 2)) as KanbanMetricsService,
      () => t0,
    )
    const r = await svc.getPredictabilitySummary(WS, TEAM, undefined, 6, actor)
    assert.equal(r.methodologyContext, "mixed")
    assert.equal(r.variation, null)
    assert(r.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX))
  })

  it("getPredictabilityTrend: returns scrum and kanban points; periodsUsedCount from resolvePeriodsUsedCount", async () => {
    teams.rows.push(teamState(TEAM))
    links.rows = [link(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const t0 = new Date("2024-01-10T00:00:00.000Z")
    memSprint.sprints = [closedSprint(PROJ, "s-0", t0)]
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      mockSprintService() as SprintMetricsService,
      mockKanban(baseWeeks(0, 0)) as KanbanMetricsService,
      () => t0,
    )
    const tr = await svc.getPredictabilityTrend(WS, TEAM, undefined, 6, actor)
    assert.equal(tr.scrumPoints.length, 1)
    assert.equal(tr.kanbanPoints.length, 0)
    assert.equal(tr.periodsUsedCount, 1)
  })

  it("listWorkspacePredictabilityTeams: methodology mix at workspace and two teams", async () => {
    mems.rows = [predMembership("u-test", TEAM), predMembership("u-test", OTHER_TEAM)]
    teams.rows = [teamState(TEAM), teamState(OTHER_TEAM)]
    links.rows = [link(TEAM, PROJ), link(OTHER_TEAM, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const t0 = new Date("2024-01-10T00:00:00.000Z")
    memSprint.sprints = [closedSprint(PROJ, "s-0", t0)]
    const kan = mockKanban(baseWeeks(6, 1))
    const dynamicSm2 = {
      getBasicSprintMetrics: async () => basicSprintMetrics("s-0", 4),
    } as SprintMetricsService
    const svc = new TeamPredictabilityMetricsService(
      teams,
      mems,
      links,
      runtime,
      memSprint,
      dynamicSm2,
      kan as KanbanMetricsService,
      () => t0,
    )
    const list = await svc.listWorkspacePredictabilityTeams(
      WS,
      { limit: 10, offset: 0, includeArchived: false, lastN: 6 },
      actor,
    )
    assert.equal(list.items.length, 2)
    assert.equal(list.methodologyContextWorkspace, "mixed")
    assert(list.dataQualityWarnings.includes(DataQualityWarningCode.METHODOLOGY_MIX))
  })
})
