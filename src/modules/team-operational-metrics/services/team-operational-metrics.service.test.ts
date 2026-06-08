import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import type { ImpedimentListFilters, ImpedimentListResult, ImpedimentRepository } from "../../project-impediments/persistence/impediment.repository.js"
import type { ImpedimentState } from "../../project-impediments/domain/impediment.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type {
  WorkTeamMembershipState,
  WorkTeamProjectLinkState,
  WorkTeamState,
} from "../../workspace-work-teams/domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type { ListWorkTeamsFilters, Pagination, WorkTeamRepository } from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { TeamOperationalMetricsNotFoundError } from "../domain/team-operational-metrics.errors.js"
import { OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS } from "../domain/team-operational-metrics.constants.js"
import { createTeamOperationalMetricsService } from "../team-operational-metrics.module.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"

const actorAdmin = minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })
const WS = "a1000000-0000-4000-8000-000000000001"
const TEAM = "a2000000-0000-4000-8000-000000000002"
const PROJ = "a3000000-0000-4000-8000-000000000003"
const PROJ_K = "a4000000-0000-4000-8000-000000000004"
const U1 = "b1000000-0000-4000-8000-000000000011"
const U2 = "b2000000-0000-4000-8000-000000000012"
const LEAD = "b3000000-0000-4000-8000-000000000013"
const U_ORPH = "b4000000-0000-4000-8000-000000000014"

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

class MemTeamRepo implements WorkTeamRepository {
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
    const totalCount = list.length
    return { items: list.slice(pagination.offset, pagination.offset + pagination.limit), totalCount }
  }
  async update() {
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
  async listByTeam(teamPublicId: string, options: { activeOnly: boolean }) {
    return this.rows.filter((m) => m.teamPublicId === teamPublicId && (options.activeOnly ? m.isActive : true))
  }
  async softDeactivate() {
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
  async findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ) {
    return (
      this.items.find(
        (i) =>
          i.workspacePublicId === workspacePublicId &&
          i.projectPublicId === projectPublicId &&
          i.backlogItemPublicId === backlogItemPublicId,
      ) ?? null
    )
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

class MemImped implements ImpedimentRepository {
  items: ImpedimentState[] = []
  statusMatches(status: import("../../project-impediments/domain/impediment.js").ImpedimentStatus, filter?: ImpedimentListFilters["status"]): boolean {
    if (filter == null) return true
    const st = Array.isArray(filter) ? filter : [filter]
    return st.includes(status)
  }
  async insert() {
    return
  }
  async replace() {
    return
  }
  async findByProjectAndId() {
    return null
  }
  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    filters: ImpedimentListFilters,
    _pagination: { limit: number; offset: number },
  ): Promise<ImpedimentListResult> {
    const items = this.items.filter(
      (i) =>
        i.workspacePublicId === workspacePublicId &&
        i.projectPublicId === projectPublicId &&
        this.statusMatches(i.status, filters.status),
    )
    return { items, totalCount: items.length }
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

class MemWorkspaceUser implements Pick<WorkspaceUserService, "listMembers"> {
  list: WorkspaceMemberState[] = [
    {
      membershipPublicId: "m-1",
      workspacePublicId: WS,
      userPublicId: U1,
      emailNormalized: "u1@test",
      fullName: "Uno",
      status: "active",
      hasSeatAssigned: true,
      workspaceRoleAdministrative: null,
      workspaceRoleMethodological: "scrum_developer",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
    {
      membershipPublicId: "m-2",
      workspacePublicId: WS,
      userPublicId: U2,
      emailNormalized: "u2@test",
      fullName: "Dos",
      status: "active",
      hasSeatAssigned: true,
      workspaceRoleAdministrative: null,
      workspaceRoleMethodological: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  ]
  async listMembers() {
    return this.list
  }
}

function teamState(over: Partial<WorkTeamState> = {}): WorkTeamState {
  const now = new Date(0)
  return {
    teamPublicId: TEAM,
    workspacePublicId: WS,
    name: "Squad A",
    nameNormalized: "squad a",
    description: null,
    status: "active",
    teamLeadUserPublicId: LEAD,
    targetSize: 5,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function membershipRow(user: string, team = TEAM, active = true): WorkTeamMembershipState {
  const now = new Date(0)
  return {
    teamMembershipPublicId: randomUUID(),
    workspacePublicId: WS,
    teamPublicId: team,
    userPublicId: user,
    joinedAt: now,
    leftAt: null,
    isActive: active,
    createdAt: now,
    updatedAt: now,
  }
}

function linkRow(team: string, project: string): WorkTeamProjectLinkState {
  const now = new Date(0)
  return {
    teamProjectLinkPublicId: randomUUID(),
    workspacePublicId: WS,
    teamPublicId: team,
    projectPublicId: project,
    createdAt: now,
    updatedAt: now,
  }
}

describe("team-operational-metrics.service", () => {
  let teams: MemTeamRepo
  let mems: MemMemberships
  let links: MemLinks
  let backlog: MemBacklog
  let imps: MemImped
  let runtime: MemRuntime
  let users: MemWorkspaceUser

  beforeEach(() => {
    teams = new MemTeamRepo()
    mems = new MemMemberships()
    teams.memLookup = mems
    links = new MemLinks()
    backlog = new MemBacklog()
    imps = new MemImped()
    runtime = new MemRuntime()
    users = new MemWorkspaceUser()
  })

  it("getTeamMetricsSummary: counts, targetSize, capacityGap, blocked, impediments", async () => {
    teams.rows.push(teamState())
    mems.rows = [membershipRow(U1), membershipRow(U2), membershipRow(LEAD)]
    links.rows = [linkRow(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    for (let i = 0; i < 3; i += 1) {
      backlog.items.push(backlogItem({ assignedUserPublicId: U1, isBlocked: i === 0, status: "in_progress" }))
    }
    backlog.items.push(
      backlogItem({ itemType: "epic", assignedUserPublicId: U1, status: "open" }),
    )
    backlog.items.push(
      backlogItem({ assignedUserPublicId: null, status: "open", itemType: "user_story" }),
    )
    imps.items.push({
      impedimentPublicId: randomUUID(),
      workspacePublicId: WS,
      projectPublicId: PROJ,
      relatedWorkItemPublicId: backlog.items[0].backlogItemPublicId,
      relatedSprintPublicId: null,
      title: "I",
      description: "d",
      status: "open",
      severity: "critical",
      responsibleUserPublicId: U1,
      reportedByUserPublicId: U1,
      detectedAt: new Date(0),
      resolvedAt: null,
      dismissedAt: null,
      resolutionSummary: null,
      dismissalReason: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    imps.items.push({
      ...imps.items[0],
      impedimentPublicId: randomUUID(),
      severity: "low",
    })

    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const s = await svc.getTeamMetricsSummary(actorAdmin, WS, TEAM, undefined)
    assert.equal(s.activeMembersCount, 3)
    assert.equal(s.targetSize, 5)
    assert.equal(s.capacityGap, 2)
    assert.equal(s.linkedProjectsCount, 1)
    assert.equal(s.assignedActiveWorkItemsCount, 3)
    assert.equal(s.unassignedWorkItemsCount, 1)
    assert.equal(s.blockedWorkItemsCount, 1)
    assert.equal(s.openImpedimentsCount, 2)
    assert.equal(s.criticalOpenImpedimentsCount, 1)
    assert.equal(s.hasSufficientData, true)
    assert.equal(s.teamLeadUserPublicId, LEAD)
  })

  it("rejects missing team with TeamOperationalMetricsNotFoundError", async () => {
    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    await assert.rejects(
      () => svc.getTeamMetricsSummary(actorAdmin, WS, randomUUID(), undefined),
      (e: unknown) => e instanceof TeamOperationalMetricsNotFoundError,
    )
  })

  it("getTeamMemberBreakdown: isIdle, isOverloaded, share, unassigned", async () => {
    teams.rows.push(teamState({ teamLeadUserPublicId: null }))
    mems.rows = [membershipRow(U1), membershipRow(U2), membershipRow(U_ORPH, TEAM, true)]
    links.rows = [linkRow(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    for (let k = 0; k < OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS; k += 1) {
      backlog.items.push(backlogItem({ assignedUserPublicId: U1, status: "open" }))
    }
    for (let u = 0; u < 4; u += 1) {
      backlog.items.push(
        backlogItem({ assignedUserPublicId: null, itemType: "user_story" }),
      )
    }
    for (const it of backlog.items) {
      if (it.assignedUserPublicId === U1) imps.items.push({
        impedimentPublicId: randomUUID(),
        workspacePublicId: WS,
        projectPublicId: PROJ,
        relatedWorkItemPublicId: it.backlogItemPublicId,
        relatedSprintPublicId: null,
        title: "x",
        description: "x",
        status: "mitigating",
        severity: "medium",
        responsibleUserPublicId: U1,
        reportedByUserPublicId: U1,
        detectedAt: new Date(0),
        resolvedAt: null,
        dismissedAt: null,
        resolutionSummary: null,
        dismissalReason: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })
    }

    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const b = await svc.getTeamMemberBreakdown(actorAdmin, WS, TEAM, undefined)
    const r1 = b.members.find((m) => m.userPublicId === U1)
    const r2 = b.members.find((m) => m.userPublicId === U2)
    assert(r1)
    assert(r2)
    assert.equal(r1.isOverloaded, true)
    assert.equal(r1.isIdle, false)
    assert.equal(r1.openImpedimentsOnAssignedItemsCount, OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS)
    assert.equal(r2.isIdle, true)
    assert.equal(b.dataQualityWarnings.some((w) => w.startsWith("high_unassigned_ratio")), true)
  })

  it("no linked projects: members idle with hasSufficientData false", async () => {
    teams.rows.push(teamState())
    mems.rows = [membershipRow(U1)]
    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const b = await svc.getTeamMemberBreakdown(actorAdmin, WS, TEAM, undefined)
    assert.equal(b.members[0]!.isIdle, true)
    assert.equal(b.members[0]!.hasSufficientData, false)
  })

  it("listWorkspaceTeamsMetrics: mixed methodology warning in workspace", async () => {
    const t2 = "c2000000-0000-4000-8000-00000000c002"
    teams.rows.push(teamState(), {
      ...teamState(),
      teamPublicId: t2,
      name: "B",
      nameNormalized: "b",
    })
    mems.rows = [membershipRow(U1, TEAM), membershipRow(U1, t2)]
    links.rows = [linkRow(TEAM, PROJ), linkRow(t2, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))

    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const list = await svc.listWorkspaceTeamsMetrics(
      WS,
      { limit: 10, offset: 0, includeArchived: false },
      actorAdmin,
    )
    assert.equal(list.items.length, 2)
    assert.equal(list.methodologyContextWorkspace, "mixed")
    assert(list.dataQualityWarnings.some((w) => w.includes("mixed_methodology") || w.includes("workspace_teams_mixed")) )
  })

  it("getTeamMetricsSummary: product_owner not in team gets not found", async () => {
    teams.rows.push(teamState())
    mems.rows = [membershipRow(U1)]
    links.rows = [linkRow(TEAM, PROJ)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const po = minimalWorkspaceMember({
      workspaceRoleMethodological: "product_owner",
      userPublicId: "po-orphan",
    })
    await assert.rejects(
      () => svc.getTeamMetricsSummary(po, WS, TEAM, undefined),
      (e: unknown) => e instanceof TeamOperationalMetricsNotFoundError,
    )
  })

  it("listWorkspaceTeamsMetrics: scrum_master only sees teams they belong to", async () => {
    const t2 = "c2000000-0000-4000-8000-00000000c002"
    teams.rows.push(teamState(), {
      ...teamState(),
      teamPublicId: t2,
      name: "B",
      nameNormalized: "b",
    })
    mems.rows = [membershipRow(U1, TEAM)]
    links.rows = [linkRow(TEAM, PROJ), linkRow(t2, PROJ_K)]
    runtime.byId.set(`${WS}::${PROJ}`, project("scrum", PROJ))
    runtime.byId.set(`${WS}::${PROJ_K}`, project("kanban", PROJ_K))
    const svc = createTeamOperationalMetricsService(users as unknown as WorkspaceUserService, {
      teams,
      memberships: mems,
      projectLinks: links,
      backlog,
      impediments: imps,
      projectRuntime: runtime,
    })
    const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master", userPublicId: U1 })
    const list = await svc.listWorkspaceTeamsMetrics(
      WS,
      { limit: 10, offset: 0, includeArchived: false },
      sm,
    )
    assert.equal(list.items.length, 1)
    assert.equal(list.items[0]?.teamPublicId, TEAM)
    assert.equal(list.totalCount, 1)
  })
})
