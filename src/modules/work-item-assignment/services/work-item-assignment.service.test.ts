import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkTeamState } from "../../workspace-work-teams/domain/work-team.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import type {
  ListWorkTeamsFilters,
  Pagination,
  WorkTeamRepository,
} from "../../workspace-work-teams/persistence/work-team.repository.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkItemAssignmentHistoryEvent } from "../domain/work-item-assignment-history-event.js"
import { WorkItemAssignmentConflictError } from "../domain/work-item-assignment.errors.js"
import { ProjectWorkAssignmentError } from "../domain/project-work-assignment.errors.js"
import { applyWorkItemAssignmentListFilter } from "../utils/work-item-assignment-list-filter.util.js"
import { ProjectAssignableUsersService } from "./project-assignable-users.service.js"
import { WorkItemAssignmentService } from "./work-item-assignment.service.js"

const WS = "a0000000-0000-4000-8000-000000000001"
const PROJ = "b0000000-0000-4000-8000-000000000002"
const ITEM = "c0000000-0000-4000-8000-00000000cafe"
const COORD = "d0000000-0000-4000-8000-00000000d001"
const DEV = "d0000000-0000-4000-8000-00000000d002"
const PEER = "d0000000-0000-4000-8000-00000000d003"
const OUT = "d0000000-0000-4000-8000-00000000d0ff"
const TEAM_1 = "e0000000-0000-4000-8000-00000000e001"

function scrumProject(): WorkspaceRuntimeProjectState {
  const now = new Date()
  return {
    projectPublicId: PROJ,
    workspacePublicId: WS,
    sourceDraftPublicId: "d-1",
    projectName: "P1",
    operationalApproach: "scrum",
    initialConfigurationSummary: defaultInitialConfigurationSummary("scrum"),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function stateUserStory(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: ITEM,
    workspacePublicId: WS,
    projectPublicId: PROJ,
    itemType: "user_story",
    title: "S",
    description: "",
    status: "open",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: COORD,
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
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

class MemBacklog implements ScrumBacklogRepository {
  items: Map<string, ScrumBacklogItemState> = new Map()
  key(id: string) {
    return `${WS}::${PROJ}::${id}`
  }
  constructor(seed: ScrumBacklogItemState) {
    this.items.set(this.key(seed.backlogItemPublicId), { ...seed })
  }
  async insert(_s: ScrumBacklogItemState): Promise<void> {
    /* noop */
  }
  async replace(s: ScrumBacklogItemState): Promise<void> {
    this.items.set(this.key(s.backlogItemPublicId), s)
  }
  async findByProjectAndItemId(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ) {
    return this.items.get(`${workspacePublicId}::${projectPublicId}::${backlogItemPublicId}`) ?? null
  }
  async listByProject(workspacePublicId: string, projectPublicId: string) {
    return [...this.items.values()].filter(
      (i) => i.workspacePublicId === workspacePublicId && i.projectPublicId === projectPublicId,
    )
  }
  async maxSortOrderAmongSiblings() {
    return 0
  }
  async bulkSetSortOrders() {
    /* noop */
  }
  async pushAssignmentEventAndSetAssignee(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    u: {
      assignedUserPublicId: string | null
      assignmentUpdatedAt: Date
      assignmentUpdatedByUserPublicId: string | null
      event: WorkItemAssignmentHistoryEvent
    },
  ) {
    const k = `${workspacePublicId}::${projectPublicId}::${backlogItemPublicId}`
    const cur = this.items.get(k)
    if (!cur) return null
    const n: ScrumBacklogItemState = {
      ...cur,
      assignedUserPublicId: u.assignedUserPublicId,
      assignmentUpdatedAt: u.assignmentUpdatedAt,
      assignmentUpdatedByUserPublicId: u.assignmentUpdatedByUserPublicId,
      assignmentHistory: [...cur.assignmentHistory, u.event],
      updatedAt: u.assignmentUpdatedAt,
    }
    this.items.set(k, n)
    return n
  }
  async adjustCommentsCount() {
    return true
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

class MemProjectRuntime implements ProjectRuntimeRepository {
  constructor(private readonly projects: Map<string, WorkspaceRuntimeProjectState>) {}
  async insert(): Promise<void> {
    /* noop */
  }
  async findByWorkspaceAndProjectPublicId(ws: string, projectPublicId: string) {
    return this.projects.get(`${ws}::${projectPublicId}`) ?? null
  }
  async findByWorkspaceAndSourceDraftPublicId() {
    return null
  }
  async listByWorkspacePublicId() {
    return [...this.projects.values()]
  }
}

class MemLinks implements WorkTeamProjectLinkRepository {
  rows: import("../../workspace-work-teams/domain/work-team.js").WorkTeamProjectLinkState[] = []
  async insert(
    s: import("../../workspace-work-teams/domain/work-team.js").WorkTeamProjectLinkState,
  ): Promise<void> {
    this.rows.push(s)
  }
  async deleteByTeamAndProject() {
    return false
  }
  async listByTeam() {
    return []
  }
  async listByProject(workspacePublicId: string, projectPublicId: string) {
    return this.rows.filter((r) => r.workspacePublicId === workspacePublicId && r.projectPublicId === projectPublicId)
  }
  async findByTeamAndProject() {
    return null
  }
}

class MemTeams implements WorkTeamRepository {
  constructor(public readonly rows: WorkTeamState[] = []) {}
  async insert(_s: WorkTeamState): Promise<void> {
    /* noop */
  }
  async findByTeamPublicId(_ws: string, teamPublicId: string) {
    return this.rows.find((t) => t.teamPublicId === teamPublicId) ?? null
  }
  async findByWorkspaceAndNameNormalized() {
    return null
  }
  async list(
    _workspacePublicId: string,
    _filters: ListWorkTeamsFilters,
    _pagination: Pagination,
  ) {
    return { items: this.rows, totalCount: this.rows.length }
  }
  async update() {
    return null
  }
}

class MemMembership implements WorkTeamMembershipRepository {
  rows: import("../../workspace-work-teams/domain/work-team.js").WorkTeamMembershipState[] = []
  async insert(
    s: import("../../workspace-work-teams/domain/work-team.js").WorkTeamMembershipState,
  ): Promise<void> {
    this.rows.push(s)
  }
  async findActiveByTeamAndUser() {
    return null
  }
  async listByTeam(
    teamPublicId: string,
    options: { activeOnly: boolean; workspacePublicId?: string },
  ) {
    let list = this.rows.filter((r) => r.teamPublicId === teamPublicId)
    if (options.workspacePublicId) {
      list = list.filter((r) => r.workspacePublicId === options.workspacePublicId)
    }
    if (options.activeOnly) list = list.filter((r) => r.isActive !== false)
    return list
  }
  async softDeactivate() {
    return null
  }
}

function teamRow(id: string, name: string): WorkTeamState {
  const now = new Date()
  return {
    teamPublicId: id,
    workspacePublicId: WS,
    name,
    nameNormalized: name.toLowerCase(),
    description: null,
    status: "active",
    teamLeadUserPublicId: null,
    targetSize: null,
    createdAt: now,
    updatedAt: now,
  }
}

function memberRow(teamPublicId: string, userPublicId: string) {
  const now = new Date()
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

const stubProjectRuntime: ProjectRuntimeService = {
  async requireScrumOrKanbanWorkspaceRuntimeProject() {
    /* noop */
  },
} as unknown as ProjectRuntimeService

function act(
  over: Pick<Partial<WorkspaceMemberState>, "userPublicId" | "workspaceRoleAdministrative" | "workspaceRoleMethodological"> =
    {},
): WorkspaceMemberState {
  return {
    membershipPublicId: "m-1",
    workspacePublicId: WS,
    userPublicId: COORD,
    emailNormalized: "c@test",
    fullName: "C",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as WorkspaceMemberState
}

describe("WorkItemAssignmentService (in-memory)", () => {
  let links: MemLinks
  let mem: MemMembership
  let teams: MemTeams
  let projectRepo: MemProjectRuntime
  let users: WorkspaceUserService
  let assignables: ProjectAssignableUsersService
  let svc: WorkItemAssignmentService
  let backlog: MemBacklog

  function wireUsers(allowed: Set<string>) {
    users = {
      async findActorMember(_ws: string, userPublicId: string) {
        if (!allowed.has(userPublicId)) return null
        return { ...act(), userPublicId, status: "active" } as WorkspaceMemberState
      },
      async listAssignableMembersForWorkItems(_ws: string) {
        return [...allowed].map((userPublicId) => ({
          userPublicId,
          fullName: `Name ${userPublicId.slice(0, 8)}`,
          emailNormalized: `${userPublicId}@t.test`,
        }))
      },
    } as unknown as WorkspaceUserService
  }

  beforeEach(() => {
    links = new MemLinks()
    mem = new MemMembership()
    teams = new MemTeams([teamRow(TEAM_1, "T1")])
    projectRepo = new MemProjectRuntime(new Map([[`${WS}::${PROJ}`, scrumProject()]]))
    wireUsers(new Set([COORD, DEV, PEER, OUT]))
    assignables = new ProjectAssignableUsersService(projectRepo, links, teams, mem, users)
    backlog = new MemBacklog(stateUserStory())
    svc = new WorkItemAssignmentService(backlog, stubProjectRuntime, users, assignables, null)
  })

  it("fails to assign or self-assign new work when the project has no team links (ASG_PROJECT_HAS_NO_LINKED_TEAMS)", async () => {
    await assert.rejects(
      () => svc.assignWorkItem(act(), WS, PROJ, ITEM, DEV),
      (e) => e instanceof ProjectWorkAssignmentError && e.code === "ASG_PROJECT_HAS_NO_LINKED_TEAMS",
    )
    const dev = act({ userPublicId: DEV, workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" })
    await assert.rejects(
      () => svc.selfAssignWorkItem(dev, WS, PROJ, ITEM),
      (e) => e instanceof ProjectWorkAssignmentError && e.code === "ASG_PROJECT_HAS_NO_LINKED_TEAMS",
    )
  })

  it("rejects assign to epic (ASG_WORK_ITEM_TYPE_NOT_ASSIGNABLE)", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, DEV))
    backlog.items.set(backlog.key(ITEM), stateUserStory({ itemType: "epic" }))
    await assert.rejects(
      () => svc.assignWorkItem(act(), WS, PROJ, ITEM, DEV),
      (e) => e instanceof ProjectWorkAssignmentError && e.code === "ASG_WORK_ITEM_TYPE_NOT_ASSIGNABLE",
    )
  })

  it("rejects user outside the assignable universe (ASG_ASSIGNEE_NOT_ELIGIBLE)", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, DEV))
    await assert.rejects(
      () => svc.assignWorkItem(act(), WS, PROJ, ITEM, OUT),
      (e) => e instanceof ProjectWorkAssignmentError && e.code === "ASG_ASSIGNEE_NOT_ELIGIBLE",
    )
  })

  it("coordinator assigns, reassigns, and unassigns; developer cannot reassign to a third party", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, DEV), memberRow(TEAM_1, PEER))

    const a1 = await svc.assignWorkItem(act(), WS, PROJ, ITEM, DEV)
    assert.equal(a1.assignedUserPublicId, DEV)
    const a2 = await svc.assignWorkItem(act(), WS, PROJ, ITEM, PEER)
    assert.equal(a2.assignedUserPublicId, PEER)
    const a3 = await svc.unassignWorkItem(act(), WS, PROJ, ITEM)
    assert.equal(a3.assignedUserPublicId, null)

    const dev = act({ userPublicId: DEV, workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" })
    await assert.rejects(
      () => svc.patchWorkItemAssignment(dev, WS, PROJ, ITEM, PEER),
      (e) => e instanceof ProjectWorkAssignmentError && e.code === "ASG_REASSIGN_NOT_ALLOWED",
    )
    const sm = act({
      userPublicId: COORD,
      workspaceRoleAdministrative: null,
      workspaceRoleMethodological: "scrum_master",
    })
    const ok = await svc.assignWorkItem(sm, WS, PROJ, ITEM, PEER)
    assert.equal(ok.assignedUserPublicId, PEER)
  })

  it("scrum developer self-assigns and self-unassigns", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, DEV))
    const dev = act({ userPublicId: DEV, workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" })
    const a1 = await svc.selfAssignWorkItem(dev, WS, PROJ, ITEM)
    assert.equal(a1.assignedUserPublicId, DEV)
    const a2 = await svc.selfUnassignWorkItem(dev, WS, PROJ, ITEM)
    assert.equal(a2.assignedUserPublicId, null)
  })

  it("self-assign fails with conflict when the item is already assigned to another user", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, DEV), memberRow(TEAM_1, PEER))
    await svc.assignWorkItem(act(), WS, PROJ, ITEM, PEER)
    const dev = act({ userPublicId: DEV, workspaceRoleAdministrative: null, workspaceRoleMethodological: "scrum_developer" })
    await assert.rejects(() => svc.selfAssignWorkItem(dev, WS, PROJ, ITEM), WorkItemAssignmentConflictError)
  })

  it("keeps read path for a stale/orphan assignee; live validation applies on new assign", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, OUT))
    await svc.assignWorkItem(act(), WS, PROJ, ITEM, OUT)
    mem.rows = mem.rows.filter((m) => m.userPublicId !== OUT)
    const snap = await svc.getWorkItemAssignment(act(), WS, PROJ, ITEM)
    assert.equal(snap.assignedUserPublicId, OUT)
    mem.rows.push(memberRow(TEAM_1, PEER))
    const ok = await svc.assignWorkItem(act(), WS, PROJ, ITEM, PEER)
    assert.equal(ok.assignedUserPublicId, PEER)
  })
})

describe("applyWorkItemAssignmentListFilter", () => {
  const a = (uid: string) =>
    ({
      userPublicId: uid,
    }) as unknown as WorkspaceMemberState

  it("filters unassigned, me, and assigneeUserPublicId (AND)", () => {
    const items = [
      { assignedUserPublicId: null as string | null },
      { assignedUserPublicId: "u1" },
      { assignedUserPublicId: "u1" },
    ]
    const r0 = applyWorkItemAssignmentListFilter(items, a("u1"), { unassigned: true })
    assert.equal(r0.length, 1)
    const r1 = applyWorkItemAssignmentListFilter(items, a("u1"), { assignee: "me" })
    assert.equal(r1.length, 2)
    const r2 = applyWorkItemAssignmentListFilter(items, a("u2"), { assigneeUserPublicId: "u1" })
    assert.equal(r2.length, 2)
  })
})
