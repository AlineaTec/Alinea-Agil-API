import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it, beforeEach } from "node:test"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
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
import { ProjectAssignableUsersService } from "./project-assignable-users.service.js"

const WS = "a0000000-0000-4000-8000-000000000001"
const PROJ = "b0000000-0000-4000-8000-000000000002"
const USER_A = "c0000000-0000-4000-8000-0000000000a1"
const USER_B = "d0000000-0000-4000-8000-0000000000b2"
const USER_C = "d0000000-0000-4000-8000-0000000000c3"

const TEAM_1 = "e0000000-0000-4000-8000-0000000000e1"
const TEAM_2 = "e0000000-0000-4000-8000-0000000000e2"

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

function actor(over: Partial<WorkspaceMemberState> = {}): WorkspaceMemberState {
  return {
    membershipPublicId: "m-1",
    workspacePublicId: WS,
    userPublicId: USER_B,
    emailNormalized: "a@test",
    fullName: "A",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  }
}

describe("ProjectAssignableUsersService (in-memory)", () => {
  let links: MemLinks
  let mem: MemMembership
  let teams: MemTeams
  let projectRepo: MemProjectRuntime
  let users: WorkspaceUserService
  let service: ProjectAssignableUsersService

  beforeEach(() => {
    links = new MemLinks()
    mem = new MemMembership()
    teams = new MemTeams([teamRow(TEAM_1, "Alpha"), teamRow(TEAM_2, "Beta")])
    projectRepo = new MemProjectRuntime(new Map([[`${WS}::${PROJ}`, scrumProject()]]))
    users = {
      async listAssignableMembersForWorkItems(workspacePublicId: string) {
        if (workspacePublicId !== WS) return []
        return [
          { userPublicId: USER_A, fullName: "User A", emailNormalized: "a@test" },
          { userPublicId: USER_B, fullName: "User B", emailNormalized: "b@test" },
        ]
      },
      async findActorMember(workspacePublicId: string, userPublicId: string) {
        if (workspacePublicId !== WS) return null
        if (userPublicId === USER_A)
          return { ...actor(), userPublicId: USER_A, fullName: "User A" }
        if (userPublicId === USER_B)
          return { ...actor(), userPublicId: USER_B, fullName: "User B" }
        return null
      },
    } as unknown as WorkspaceUserService
    service = new ProjectAssignableUsersService(projectRepo, links, teams, mem, users)
  })

  it("returns empty list when the project has no team links", async () => {
    const r = await service.listAssignablesForProject(WS, PROJ)
    assert.equal(r.projectTeamLinkCount, 0)
    assert.equal(r.members.length, 0)
  })

  it("deduplicates a user that belongs to two linked teams, merging source teams", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_2,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, USER_A), memberRow(TEAM_2, USER_A))

    const r = await service.listAssignablesForProject(WS, PROJ)
    assert.equal(r.projectTeamLinkCount, 2)
    assert.equal(r.members.length, 1)
    assert.equal(r.members[0].userPublicId, USER_A)
    assert.equal(r.members[0].fullName, "User A")
    assert.equal(r.members[0].sourceTeams.length, 2)
    const names = r.members[0].sourceTeams.map((t) => t.teamName).sort()
    assert.deepEqual(names, ["Alpha", "Beta"])
  })

  it("isUserInAssignableUniverse is true only for active linked members", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, USER_A))
    assert.equal(await service.isUserInAssignableUniverse(WS, PROJ, USER_A), true)
    assert.equal(await service.isUserInAssignableUniverse(WS, PROJ, USER_B), false)
  })

  it("excludes linked-team members who are not in listAssignableMembersForWorkItems", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    mem.rows.push(memberRow(TEAM_1, USER_A), memberRow(TEAM_1, USER_C))

    const r = await service.listAssignablesForProject(WS, PROJ)
    assert.equal(r.members.length, 1)
    assert.equal(r.members[0].userPublicId, USER_A)
  })

  it("includes active team members even when membership.workspacePublicId does not match (legacy / inconsistent row)", async () => {
    const otherWs = "f0000000-0000-4000-8000-000000000099"
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    const a = memberRow(TEAM_1, USER_A)
    const b = { ...memberRow(TEAM_1, USER_B), workspacePublicId: otherWs }
    mem.rows.push(a, b)

    const r = await service.listAssignablesForProject(WS, PROJ)
    assert.equal(r.members.length, 2)
    const ids = r.members.map((m) => m.userPublicId).sort()
    assert.deepEqual(ids, [USER_A, USER_B].sort())
  })

  it("treats memberships without isActive as active (alinea con la semántica histórica de membresías activas)", async () => {
    const now = new Date()
    await links.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS,
      teamPublicId: TEAM_1,
      projectPublicId: PROJ,
      createdAt: now,
      updatedAt: now,
    })
    const a = memberRow(TEAM_1, USER_A)
    const b = { ...memberRow(TEAM_1, USER_B) } as (typeof a & { isActive?: boolean })
    Reflect.deleteProperty(b, "isActive")
    mem.rows.push(a, b)

    const r = await service.listAssignablesForProject(WS, PROJ)
    assert.equal(r.members.length, 2)
  })
})
