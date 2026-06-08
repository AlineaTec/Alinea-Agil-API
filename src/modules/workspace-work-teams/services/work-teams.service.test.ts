import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkTeamState, WorkTeamStatus } from "../domain/work-team.js"
import { WorkTeamConflictError, WorkTeamForbiddenError, WorkTeamValidationError } from "../domain/work-team.errors.js"
import type { WorkTeamAuditAppendInput, WorkTeamAuditRepository } from "../persistence/work-team-audit.repository.js"
import type { ListWorkTeamsFilters, Pagination, WorkTeamRepository } from "../persistence/work-team.repository.js"
import type { WorkTeamMembershipRepository } from "../persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../persistence/work-team-project-link.repository.js"
import { normalizeWorkTeamNameForUniqueness } from "../utils/work-team-name.js"
import { WorkTeamsService } from "./work-teams.service.js"

const WS = "10000000-0000-4000-8000-000000000001"
const PROJ = "20000000-0000-4000-8000-000000000002"
const USER_A = "30000000-0000-4000-8000-000000000003"
const USER_B = "40000000-0000-4000-8000-000000000004"
const USER_C = "50000000-0000-4000-8000-000000000005"
const USER_D = "60000000-0000-4000-8000-000000000006"

function actor(over: Partial<WorkspaceMemberState> = {}): WorkspaceMemberState {
  return {
    membershipPublicId: "m-actor",
    workspacePublicId: WS,
    userPublicId: USER_D,
    emailNormalized: "actor@test.dev",
    fullName: "Actor",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  }
}

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

class MemTeams implements WorkTeamRepository {
  rows: WorkTeamState[] = []

  async insert(state: WorkTeamState, _session?: unknown): Promise<void> {
    this.rows.push(structuredClone(state))
  }
  async findByTeamPublicId(
    workspacePublicId: string,
    teamPublicId: string,
  ): Promise<WorkTeamState | null> {
    return this.rows.find((r) => r.workspacePublicId === workspacePublicId && r.teamPublicId === teamPublicId) ?? null
  }
  async findByWorkspaceAndNameNormalized(
    workspacePublicId: string,
    nameNormalized: string,
  ): Promise<WorkTeamState | null> {
    return this.rows.find((r) => r.workspacePublicId === workspacePublicId && r.nameNormalized === nameNormalized) ?? null
  }
  async list(
    workspacePublicId: string,
    filters: ListWorkTeamsFilters,
    pagination: Pagination,
  ): Promise<{ items: WorkTeamState[]; totalCount: number }> {
    void filters.memberUserPublicId
    let list = this.rows.filter((r) => r.workspacePublicId === workspacePublicId)
    if (filters.status) list = list.filter((r) => r.status === filters.status)
    if (filters.teamLeadUserPublicId) {
      list = list.filter((r) => r.teamLeadUserPublicId === filters.teamLeadUserPublicId)
    }
    if (filters.q && filters.q.trim() !== "") {
      const re = new RegExp(filters.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      list = list.filter((r) => re.test(r.name))
    }
    const totalCount = list.length
    return { items: list.slice(pagination.offset, pagination.offset + pagination.limit), totalCount }
  }
  async update(
    workspacePublicId: string,
    teamPublicId: string,
    patch: Partial<{
      name: string
      nameNormalized: string
      description: string | null
      status: WorkTeamStatus
      teamLeadUserPublicId: string | null
      targetSize: number | null
    }>,
  ): Promise<WorkTeamState | null> {
    const i = this.rows.findIndex(
      (r) => r.workspacePublicId === workspacePublicId && r.teamPublicId === teamPublicId,
    )
    if (i < 0) return null
    const now = new Date()
    this.rows[i] = { ...this.rows[i], ...patch, updatedAt: now } as WorkTeamState
    return this.rows[i]
  }
}

class MemMembership implements WorkTeamMembershipRepository {
  rows: import("../domain/work-team.js").WorkTeamMembershipState[] = []

  async insert(
    state: import("../domain/work-team.js").WorkTeamMembershipState,
  ): Promise<void> {
    this.rows.push(structuredClone(state))
  }
  async findActiveByTeamAndUser(teamPublicId: string, userPublicId: string) {
    return this.rows.find((r) => r.teamPublicId === teamPublicId && r.userPublicId === userPublicId && r.isActive) ?? null
  }
  async listByTeam(
    teamPublicId: string,
    options: { activeOnly: boolean; workspacePublicId?: string },
  ) {
    let list = this.rows.filter((r) => r.teamPublicId === teamPublicId)
    if (options.workspacePublicId) {
      list = list.filter((r) => r.workspacePublicId === options.workspacePublicId)
    }
    if (options.activeOnly) {
      list = list.filter((r) => r.isActive !== false)
    }
    return list
  }
  async softDeactivate(teamPublicId: string, userPublicId: string, leftAt: Date) {
    const i = this.rows.findIndex(
      (r) => r.teamPublicId === teamPublicId && r.userPublicId === userPublicId && r.isActive,
    )
    if (i < 0) return null
    this.rows[i] = { ...this.rows[i], isActive: false, leftAt, updatedAt: leftAt }
    return this.rows[i]
  }
}

class MemLinks implements WorkTeamProjectLinkRepository {
  rows: import("../domain/work-team.js").WorkTeamProjectLinkState[] = []
  async insert(
    state: import("../domain/work-team.js").WorkTeamProjectLinkState,
  ): Promise<void> {
    this.rows.push(structuredClone(state))
  }
  async deleteByTeamAndProject(
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
  ) {
    const b = this.rows.length
    this.rows = this.rows.filter(
      (r) =>
        !(
          r.workspacePublicId === workspacePublicId &&
          r.teamPublicId === teamPublicId &&
          r.projectPublicId === projectPublicId
        ),
    )
    return b !== this.rows.length
  }
  async listByTeam(workspacePublicId: string, teamPublicId: string) {
    return this.rows.filter((r) => r.workspacePublicId === workspacePublicId && r.teamPublicId === teamPublicId)
  }
  async listByProject(workspacePublicId: string, projectPublicId: string) {
    return this.rows.filter((r) => r.workspacePublicId === workspacePublicId && r.projectPublicId === projectPublicId)
  }
  async findByTeamAndProject(workspacePublicId: string, teamPublicId: string, projectPublicId: string) {
    return this.rows.find(
      (r) =>
        r.workspacePublicId === workspacePublicId &&
        r.teamPublicId === teamPublicId &&
        r.projectPublicId === projectPublicId,
    ) ?? null
  }
}

class MemAudit implements WorkTeamAuditRepository {
  items: WorkTeamAuditAppendInput[] = []
  async append(input: WorkTeamAuditAppendInput): Promise<void> {
    this.items.push({ ...input, occurredAt: new Date(input.occurredAt.getTime()) })
  }
  async listByTeam() {
    return { items: [], totalCount: 0 }
  }
}

class MemProjectRuntime implements ProjectRuntimeRepository {
  constructor(private readonly projects: Map<string, WorkspaceRuntimeProjectState>) {}
  async insert(): Promise<void> {
    /* noop in tests */
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

describe("WorkTeamsService (in-memory)", () => {
  let teams: MemTeams
  let mem: MemMembership
  let links: MemLinks
  let audit: MemAudit
  let projectRepo: MemProjectRuntime
  let users: WorkspaceUserService
  let service: WorkTeamsService

  beforeEach(() => {
    teams = new MemTeams()
    mem = new MemMembership()
    links = new MemLinks()
    audit = new MemAudit()
    const projects = new Map<string, WorkspaceRuntimeProjectState>([[`${WS}::${PROJ}`, scrumProject()]])
    projectRepo = new MemProjectRuntime(projects)
    users = {
      async findActorMember(workspacePublicId: string, userPublicId: string) {
        if (workspacePublicId !== WS) return null
        if ([USER_A, USER_B, USER_C, USER_D].includes(userPublicId)) {
          return {
            ...actor(),
            userPublicId,
            status: "active",
            workspaceRoleAdministrative: "admin",
          } as WorkspaceMemberState
        }
        return null
      },
    } as unknown as WorkspaceUserService
    service = new WorkTeamsService(teams, mem, links, audit, projectRepo, users)
  })

  it("creates a team and audits", async () => {
    const t = await service.createTeam(actor(), WS, { name: "Squad A" })
    assert.equal(t.name, "Squad A")
    assert.equal(t.status, "active")
    assert.equal(audit.items.some((a) => a.action === "work_team_created"), true)
  })

  it("rejects duplicate name case-insensitively", async () => {
    await service.createTeam(actor(), WS, { name: "Squad" })
    await assert.rejects(
      () => service.createTeam(actor(), WS, { name: "SQUAD" }),
      (e) => e instanceof WorkTeamConflictError,
    )
  })

  it("normalizes with normalizeWorkTeamNameForUniqueness", () => {
    assert.equal(normalizeWorkTeamNameForUniqueness("  AbC  "), "abc")
  })

  it("create with lead inserts membership; patch adds lead not yet member (agility_lead mutator)", async () => {
    const t0 = await service.createTeam(actor(), WS, { name: "L0", teamLeadUserPublicId: USER_A })
    assert((await mem.findActiveByTeamAndUser(t0.teamPublicId, USER_A)) != null)
    const t = await service.createTeam(actor(), WS, { name: "L" })
    await service.addMember(actor(), WS, t.teamPublicId, USER_A)
    await service.patchTeam(actor(), WS, t.teamPublicId, { teamLeadUserPublicId: USER_A })
    const mutator = actor({ workspaceRoleAdministrative: null, workspaceRoleMethodological: "agility_lead" })
    await service.patchTeam(mutator, WS, t.teamPublicId, { teamLeadUserPublicId: USER_B })
    assert((await mem.findActiveByTeamAndUser(t.teamPublicId, USER_B)) != null)
  })

  it("re-join creates new membership row", async () => {
    const t = await service.createTeam(actor(), WS, { name: "R" })
    await service.addMember(actor(), WS, t.teamPublicId, USER_A)
    const first = (await mem.findActiveByTeamAndUser(t.teamPublicId, USER_A))?.teamMembershipPublicId
    await service.removeMember(actor(), WS, t.teamPublicId, USER_A, null)
    await service.addMember(actor(), WS, t.teamPublicId, USER_A)
    const second = (await mem.findActiveByTeamAndUser(t.teamPublicId, USER_A))?.teamMembershipPublicId
    assert.notEqual(first, second)
  })

  it("impedes lead not active member (patch to unknown user in workspace)", async () => {
    const t = await service.createTeam(actor(), WS, { name: "N" })
    users = {
      async findActorMember() {
        return null
      },
    } as unknown as WorkspaceUserService
    service = new WorkTeamsService(teams, mem, links, audit, projectRepo, users)
    await assert.rejects(
      () => service.patchTeam(actor(), WS, t.teamPublicId, { teamLeadUserPublicId: "99999999-0000-4000-8000-000000000999" as unknown as string }),
      WorkTeamValidationError,
    )
  })

  it("links project and rejects duplicate", async () => {
    const t = await service.createTeam(actor(), WS, { name: "Lk" })
    await service.linkProject(actor(), WS, t.teamPublicId, PROJ)
    await assert.rejects(() => service.linkProject(actor(), WS, t.teamPublicId, PROJ), WorkTeamConflictError)
  })

  it("lists teams by project", async () => {
    const t = await service.createTeam(actor(), WS, { name: "P" })
    await service.linkProject(actor(), WS, t.teamPublicId, PROJ)
    const r = await service.listTeamsByProject(actor(), WS, PROJ)
    assert.equal(r.items.length, 1)
    assert.equal(r.items[0].teamPublicId, t.teamPublicId)
  })

  it("rejects read for scrum dev on audit log", async () => {
    const t = await service.createTeam(actor(), WS, { name: "Aud" })
    const reader = actor({
      workspaceRoleAdministrative: null,
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(() => service.listAudit(reader, WS, t.teamPublicId, { limit: 10, offset: 0 }), WorkTeamForbiddenError)
  })

  it("removing team lead requires resolveLead; clear removes both lead and membership", async () => {
    const t = await service.createTeam(actor(), WS, { name: "LeadX" })
    await service.addMember(actor(), WS, t.teamPublicId, USER_A)
    await service.patchTeam(actor(), WS, t.teamPublicId, { teamLeadUserPublicId: USER_A })
    await assert.rejects(
      () => service.removeMember(actor(), WS, t.teamPublicId, USER_A, null),
      (e) => e instanceof WorkTeamValidationError,
    )
    await service.removeMember(actor(), WS, t.teamPublicId, USER_A, { resolveLead: "clear" })
    const after = await teams.findByTeamPublicId(WS, t.teamPublicId)
    assert.equal(after?.teamLeadUserPublicId, null)
  })

  it("scrum developer can list teams but cannot create (mutate)", async () => {
    const sm = actor({ workspaceRoleMethodological: "scrum_developer", workspaceRoleAdministrative: null })
    await service.createTeam(actor(), WS, { name: "G" })
    const r = await service.listTeams(sm, WS, {}, { limit: 20, offset: 0 })
    assert(r.items.length >= 1)
    await assert.rejects(() => service.createTeam(sm, WS, { name: "H" }), WorkTeamForbiddenError)
  })
})
