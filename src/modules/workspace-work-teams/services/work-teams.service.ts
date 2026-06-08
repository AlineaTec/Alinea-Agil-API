import { randomUUID } from "node:crypto"
import type { ProjectRuntimeRepository } from "../../workspace-project-runtime/persistence/project-runtime.repository.js"
import { runWithTransactionPreferred } from "../../workspace-projects/persistence/run-preferred-transaction.js"
import { ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkTeamProjectLinkState, WorkTeamState, WorkTeamStatus } from "../domain/work-team.js"
import {
  WorkTeamConflictError,
  WorkTeamNotFoundError,
  WorkTeamValidationError,
} from "../domain/work-team.errors.js"
import type { WorkTeamAuditAction } from "../domain/work-team-audit-action.js"
import { normalizeWorkTeamNameForUniqueness } from "../utils/work-team-name.js"
import type { ListWorkTeamsFilters, Pagination } from "../persistence/work-team.repository.js"
import type { WorkTeamRepository } from "../persistence/work-team.repository.js"
import type { WorkTeamMembershipRepository } from "../persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../persistence/work-team-project-link.repository.js"
import type { WorkTeamAuditRepository } from "../persistence/work-team-audit.repository.js"
import { assertCanMutateWorkTeams, assertCanReadWorkTeams, assertCanReadWorkTeamAuditLog } from "../policies/work-team-authorization.policy.js"

type WorkspaceMemberForTeam = NonNullable<Awaited<ReturnType<WorkspaceUserService["findActorMember"]>>>

type CreateTeamInput = {
  name: string
  description?: string | null
  teamLeadUserPublicId?: string | null
  targetSize?: number | null
}

type PatchTeamInput = {
  name?: string
  description?: string | null
  status?: WorkTeamStatus
  teamLeadUserPublicId?: string | null
  targetSize?: number | null
}

function teamSnapshot(t: WorkTeamState) {
  return {
    teamPublicId: t.teamPublicId,
    name: t.name,
    description: t.description,
    status: t.status,
    teamLeadUserPublicId: t.teamLeadUserPublicId,
    targetSize: t.targetSize,
  }
}

function linkSnapshot(l: WorkTeamProjectLinkState) {
  return {
    teamProjectLinkPublicId: l.teamProjectLinkPublicId,
    projectPublicId: l.projectPublicId,
  }
}

export class WorkTeamsService {
  constructor(
    private readonly teams: WorkTeamRepository,
    private readonly memberships: WorkTeamMembershipRepository,
    private readonly projectLinks: WorkTeamProjectLinkRepository,
    private readonly audit: WorkTeamAuditRepository,
    private readonly projectRuntime: ProjectRuntimeRepository,
    private readonly workspaceUserService: WorkspaceUserService,
  ) {}

  private async requireTeam(workspacePublicId: string, teamPublicId: string): Promise<WorkTeamState> {
    const t = await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)
    if (!t) throw new WorkTeamNotFoundError()
    return t
  }

  private assertMemberEligibleForTeam(m: Awaited<ReturnType<WorkspaceUserService["findActorMember"]>>): m is NonNullable<typeof m> {
    if (!m) return false
    return m.status === "active" || m.status === "active_without_seat"
  }

  private async requireEligibleMemberForTeam(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<WorkspaceMemberForTeam> {
    const m = await this.workspaceUserService.findActorMember(workspacePublicId, userPublicId)
    if (!this.assertMemberEligibleForTeam(m)) {
      throw new WorkTeamValidationError("User is not an active member of this workspace for team membership.")
    }
    return m
  }

  private async appendAudit(
    input: {
      workspacePublicId: string
      teamPublicId: string
      action: WorkTeamAuditAction
      actorUserPublicId: string
      payloadBefore: unknown
      payloadAfter: unknown
    },
  ): Promise<void> {
    await this.audit.append({
      ...input,
      occurredAt: new Date(),
    })
  }

  private async assertLeadIsActiveMember(
    team: WorkTeamState,
    session?: import("../../../infrastructure/persistence/persistence-session.js").PersistenceSession,
  ): Promise<void> {
    if (!team.teamLeadUserPublicId) return
    const mem = await this.memberships.findActiveByTeamAndUser(team.teamPublicId, team.teamLeadUserPublicId, session)
    if (!mem) {
      throw new WorkTeamValidationError("The team lead must be an active member of the team.")
    }
  }

  async listTeams(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    filters: ListWorkTeamsFilters,
    pagination: Pagination,
  ) {
    assertCanReadWorkTeams(actor)
    return this.teams.list(workspacePublicId, filters, pagination)
  }

  async getTeamDetail(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
  ): Promise<{
    team: WorkTeamState
    linkedProjects: { teamProjectLinkPublicId: string; projectPublicId: string }[]
  }> {
    assertCanReadWorkTeams(actor)
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    const rawLinks = await this.projectLinks.listByTeam(workspacePublicId, teamPublicId)
    const linkedProjects: { teamProjectLinkPublicId: string; projectPublicId: string }[] = []
    for (const l of rawLinks) {
      const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, l.projectPublicId)
      if (p) {
        linkedProjects.push({ teamProjectLinkPublicId: l.teamProjectLinkPublicId, projectPublicId: l.projectPublicId })
      }
    }
    return { team, linkedProjects }
  }

  async createTeam(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    input: CreateTeamInput,
  ): Promise<WorkTeamState> {
    assertCanMutateWorkTeams(actor)
    const name = input.name.trim()
    if (!name) {
      throw new WorkTeamValidationError("name is required")
    }
    const nameNormalized = normalizeWorkTeamNameForUniqueness(name)
    if (input.targetSize != null && (input.targetSize < 1 || input.targetSize > 10_000)) {
      throw new WorkTeamValidationError("targetSize must be between 1 and 10000 when provided")
    }
    const dup = await this.teams.findByWorkspaceAndNameNormalized(workspacePublicId, nameNormalized)
    if (dup) {
      throw new WorkTeamConflictError("A work team with this name already exists in the workspace (case-insensitive).")
    }

    if (input.teamLeadUserPublicId) {
      await this.requireEligibleMemberForTeam(workspacePublicId, input.teamLeadUserPublicId)
    }

    const now = new Date()
    const teamPublicId = randomUUID()
    const team: WorkTeamState = {
      teamPublicId,
      workspacePublicId,
      name,
      nameNormalized,
      description: input.description?.trim() ? input.description.trim() : null,
      status: "active",
      teamLeadUserPublicId: input.teamLeadUserPublicId ?? null,
      targetSize: input.targetSize ?? null,
      createdAt: now,
      updatedAt: now,
    }

    if (input.teamLeadUserPublicId) {
      const memberRow = this.newMembershipRow(workspacePublicId, teamPublicId, input.teamLeadUserPublicId, now)
      await runWithTransactionPreferred(
        async (session) => {
          await this.teams.insert(team, session)
          await this.memberships.insert(memberRow, session)
          await this.assertLeadIsActiveMember(team, session)
        },
        async () => {
          await this.teams.insert(team)
          await this.memberships.insert(memberRow)
        },
      )
    } else {
      await this.teams.insert(team)
    }

    const persisted = (await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)) as WorkTeamState
    await this.appendAudit({
      workspacePublicId,
      teamPublicId: persisted.teamPublicId,
      action: "work_team_created",
      actorUserPublicId: actor.userPublicId,
      payloadBefore: null,
      payloadAfter: teamSnapshot(persisted),
    })
    return persisted
  }

  private newMembershipRow(
    workspacePublicId: string,
    teamPublicId: string,
    userPublicId: string,
    now: Date,
  ) {
    return {
      teamMembershipPublicId: randomUUID(),
      workspacePublicId,
      teamPublicId,
      userPublicId,
      joinedAt: now,
      leftAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  }

  async patchTeam(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    patch: PatchTeamInput,
  ): Promise<WorkTeamState> {
    assertCanMutateWorkTeams(actor)
    const before = await this.requireTeam(workspacePublicId, teamPublicId)
    if (patch.targetSize != null && patch.targetSize !== null && (patch.targetSize < 1 || patch.targetSize > 10_000)) {
      throw new WorkTeamValidationError("targetSize must be between 1 and 10000 when provided")
    }

    const nextName = patch.name !== undefined ? patch.name.trim() : null
    if (nextName === "") {
      throw new WorkTeamValidationError("name cannot be empty")
    }

    const nameChange = nextName != null
    const nameNormalized = nameChange ? normalizeWorkTeamNameForUniqueness(nextName) : null
    if (nameChange && nameNormalized) {
      const other = await this.teams.findByWorkspaceAndNameNormalized(workspacePublicId, nameNormalized)
      if (other && other.teamPublicId !== teamPublicId) {
        throw new WorkTeamConflictError("A work team with this name already exists in the workspace (case-insensitive).")
      }
    }

    const $set: Record<string, unknown> = {}
    if (nameChange) {
      $set.name = nextName
      $set.nameNormalized = nameNormalized
    }
    if (patch.description !== undefined) {
      $set.description = patch.description == null || patch.description === "" ? null : patch.description.trim()
    }
    if (patch.status !== undefined) {
      $set.status = patch.status
    }
    if (patch.targetSize !== undefined) {
      $set.targetSize = patch.targetSize
    }

    if (Object.keys($set).length > 0) {
      await this.teams.update(workspacePublicId, teamPublicId, $set as Parameters<WorkTeamRepository["update"]>[2])
    }

    if (patch.teamLeadUserPublicId !== undefined) {
      const newLead = patch.teamLeadUserPublicId
      if (newLead) {
        await this.requireEligibleMemberForTeam(workspacePublicId, newLead)
        let mem = await this.memberships.findActiveByTeamAndUser(teamPublicId, newLead)
        if (!mem) {
          const now = new Date()
          await this.memberships.insert(
            this.newMembershipRow(workspacePublicId, teamPublicId, newLead, now),
          )
          mem = await this.memberships.findActiveByTeamAndUser(teamPublicId, newLead)
        }
        if (!mem) {
          throw new WorkTeamValidationError("Could not add the new lead as a team member.")
        }
      }
      await this.teams.update(workspacePublicId, teamPublicId, { teamLeadUserPublicId: newLead })
    }

    const after = (await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)) as WorkTeamState
    await this.assertLeadIsActiveMember(after)

    if (patch.status !== undefined && patch.status !== before.status) {
      await this.appendAudit({
        workspacePublicId,
        teamPublicId,
        action: "work_team_status_changed",
        actorUserPublicId: actor.userPublicId,
        payloadBefore: { status: before.status },
        payloadAfter: { status: after.status },
      })
    }

    if (patch.teamLeadUserPublicId !== undefined && (before.teamLeadUserPublicId ?? null) !== (after.teamLeadUserPublicId ?? null)) {
      await this.appendAudit({
        workspacePublicId,
        teamPublicId,
        action: "work_team_lead_changed",
        actorUserPublicId: actor.userPublicId,
        payloadBefore: { teamLeadUserPublicId: before.teamLeadUserPublicId },
        payloadAfter: { teamLeadUserPublicId: after.teamLeadUserPublicId },
      })
    }

    const otherPatch =
      (patch.name !== undefined && patch.name !== before.name) ||
      (patch.description !== undefined && (before.description ?? null) !== (after.description ?? null)) ||
      (patch.targetSize !== undefined && (before.targetSize ?? null) !== (after.targetSize ?? null))

    if (otherPatch) {
      await this.appendAudit({
        workspacePublicId,
        teamPublicId,
        action: "work_team_updated",
        actorUserPublicId: actor.userPublicId,
        payloadBefore: teamSnapshot(before),
        payloadAfter: teamSnapshot(after),
      })
    }

    return after
  }

  async listMembers(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    includeInactive: boolean,
  ) {
    assertCanReadWorkTeams(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    return this.memberships.listByTeam(teamPublicId, {
      activeOnly: !includeInactive,
      workspacePublicId: workspacePublicId,
    })
  }

  async addMember(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    userPublicId: string,
  ) {
    assertCanMutateWorkTeams(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    await this.requireEligibleMemberForTeam(workspacePublicId, userPublicId)
    const existing = await this.memberships.findActiveByTeamAndUser(teamPublicId, userPublicId)
    if (existing) {
      throw new WorkTeamConflictError("The user is already an active member of this team.")
    }
    const now = new Date()
    const row = this.newMembershipRow(workspacePublicId, teamPublicId, userPublicId, now)
    await this.memberships.insert(row)
    await this.appendAudit({
      workspacePublicId,
      teamPublicId,
      action: "work_team_member_added",
      actorUserPublicId: actor.userPublicId,
      payloadBefore: null,
      payloadAfter: {
        userPublicId,
        teamMembershipPublicId: row.teamMembershipPublicId,
        joinedAt: now.toISOString(),
      },
    })
    return row
  }

  async removeMember(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    userPublicId: string,
    leadResolution: { resolveLead: "clear" } | { resolveLead: "reassign"; newLeadUserPublicId: string } | null,
  ) {
    assertCanMutateWorkTeams(actor)
    const team = await this.requireTeam(workspacePublicId, teamPublicId)
    const mem = await this.memberships.findActiveByTeamAndUser(teamPublicId, userPublicId)
    if (!mem) {
      throw new WorkTeamValidationError("The user is not an active member of this team.")
    }
    const isLead = team.teamLeadUserPublicId === userPublicId
    if (isLead) {
      if (!leadResolution) {
        throw new WorkTeamValidationError(
          "Removing the team lead requires a body: { resolveLead: 'clear' } or { resolveLead: 'reassign', newLeadUserPublicId: <uuid> }.",
        )
      }
      if (leadResolution.resolveLead === "reassign") {
        if (leadResolution.newLeadUserPublicId === userPublicId) {
          throw new WorkTeamValidationError("newLeadUserPublicId must be a different user than the member being removed.")
        }
        const newM = await this.memberships.findActiveByTeamAndUser(teamPublicId, leadResolution.newLeadUserPublicId)
        if (!newM) {
          throw new WorkTeamValidationError("The new lead must be an active member of the team before the current lead is removed.")
        }
        const beforeT = team
        const leftAt = new Date()
        await runWithTransactionPreferred(
          async (session) => {
            await this.teams.update(
              workspacePublicId,
              teamPublicId,
              { teamLeadUserPublicId: leadResolution.newLeadUserPublicId },
              session,
            )
            const removed = await this.memberships.softDeactivate(teamPublicId, userPublicId, leftAt, session)
            if (!removed) {
              throw new WorkTeamValidationError("Could not update membership.")
            }
          },
          async () => {
            await this.teams.update(workspacePublicId, teamPublicId, {
              teamLeadUserPublicId: leadResolution.newLeadUserPublicId,
            })
            const removed = await this.memberships.softDeactivate(teamPublicId, userPublicId, leftAt)
            if (!removed) {
              throw new WorkTeamValidationError("Could not update membership.")
            }
          },
        )
        const afterT = (await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)) as WorkTeamState
        await this.appendAudit({
          workspacePublicId,
          teamPublicId,
          action: "work_team_lead_changed",
          actorUserPublicId: actor.userPublicId,
          payloadBefore: { teamLeadUserPublicId: beforeT.teamLeadUserPublicId },
          payloadAfter: { teamLeadUserPublicId: afterT.teamLeadUserPublicId },
        })
        await this.appendAudit({
          workspacePublicId,
          teamPublicId,
          action: "work_team_member_removed",
          actorUserPublicId: actor.userPublicId,
          payloadBefore: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: true },
          payloadAfter: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: false, leftAt: leftAt.toISOString() },
        })
        return
      }
      // clear
      const beforeT = team
      const leftAt = new Date()
      await runWithTransactionPreferred(
        async (session) => {
          await this.teams.update(workspacePublicId, teamPublicId, { teamLeadUserPublicId: null }, session)
          const removed = await this.memberships.softDeactivate(teamPublicId, userPublicId, leftAt, session)
          if (!removed) {
            throw new WorkTeamValidationError("Could not update membership.")
          }
        },
        async () => {
          await this.teams.update(workspacePublicId, teamPublicId, { teamLeadUserPublicId: null })
          const removed = await this.memberships.softDeactivate(teamPublicId, userPublicId, leftAt)
          if (!removed) {
            throw new WorkTeamValidationError("Could not update membership.")
          }
        },
      )
      const afterT = (await this.teams.findByTeamPublicId(workspacePublicId, teamPublicId)) as WorkTeamState
      await this.appendAudit({
        workspacePublicId,
        teamPublicId,
        action: "work_team_lead_changed",
        actorUserPublicId: actor.userPublicId,
        payloadBefore: { teamLeadUserPublicId: beforeT.teamLeadUserPublicId },
        payloadAfter: { teamLeadUserPublicId: afterT.teamLeadUserPublicId },
      })
      await this.appendAudit({
        workspacePublicId,
        teamPublicId,
        action: "work_team_member_removed",
        actorUserPublicId: actor.userPublicId,
        payloadBefore: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: true },
        payloadAfter: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: false, leftAt: leftAt.toISOString() },
      })
      return
    }
    // not lead
    if (leadResolution) {
      throw new WorkTeamValidationError("resolveLead is only allowed when removing the current team lead.")
    }
    const leftAt = new Date()
    const removed = await this.memberships.softDeactivate(teamPublicId, userPublicId, leftAt)
    if (!removed) {
      throw new WorkTeamNotFoundError()
    }
    await this.appendAudit({
      workspacePublicId,
      teamPublicId,
      action: "work_team_member_removed",
      actorUserPublicId: actor.userPublicId,
      payloadBefore: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: true },
      payloadAfter: { userPublicId, teamMembershipPublicId: mem.teamMembershipPublicId, isActive: false, leftAt: leftAt.toISOString() },
    })
  }

  async listTeamProjects(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
  ) {
    assertCanReadWorkTeams(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    const raw = await this.projectLinks.listByTeam(workspacePublicId, teamPublicId)
    const out: WorkTeamProjectLinkState[] = []
    for (const l of raw) {
      if (await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, l.projectPublicId)) {
        out.push(l)
      }
    }
    return out
  }

  async linkProject(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
  ) {
    assertCanMutateWorkTeams(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!p) {
      throw new ProjectRuntimeNotFoundError()
    }
    const existing = await this.projectLinks.findByTeamAndProject(workspacePublicId, teamPublicId, projectPublicId)
    if (existing) {
      throw new WorkTeamConflictError("The team is already linked to this project.")
    }
    const now = new Date()
    const state: WorkTeamProjectLinkState = {
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId,
      teamPublicId,
      projectPublicId,
      createdAt: now,
      updatedAt: now,
    }
    await this.projectLinks.insert(state)
    await this.appendAudit({
      workspacePublicId,
      teamPublicId,
      action: "work_team_project_linked",
      actorUserPublicId: actor.userPublicId,
      payloadBefore: null,
      payloadAfter: linkSnapshot(state),
    })
  }

  async unlinkProject(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    projectPublicId: string,
  ) {
    assertCanMutateWorkTeams(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    const before = await this.projectLinks.findByTeamAndProject(workspacePublicId, teamPublicId, projectPublicId)
    if (!before) {
      throw new WorkTeamNotFoundError()
    }
    await this.projectLinks.deleteByTeamAndProject(workspacePublicId, teamPublicId, projectPublicId)
    await this.appendAudit({
      workspacePublicId,
      teamPublicId,
      action: "work_team_project_unlinked",
      actorUserPublicId: actor.userPublicId,
      payloadBefore: linkSnapshot(before),
      payloadAfter: null,
    })
  }

  async listTeamsByProject(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
  ) {
    assertCanReadWorkTeams(actor)
    const p = await this.projectRuntime.findByWorkspaceAndProjectPublicId(workspacePublicId, projectPublicId)
    if (!p) {
      throw new ProjectRuntimeNotFoundError()
    }
    const links = await this.projectLinks.listByProject(workspacePublicId, projectPublicId)
    const results: WorkTeamState[] = []
    for (const l of links) {
      const t = await this.teams.findByTeamPublicId(workspacePublicId, l.teamPublicId)
      if (t) {
        results.push(t)
      }
    }
    return { projectPublicId, items: results }
  }

  async listAudit(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    teamPublicId: string,
    pagination: Pagination,
  ) {
    assertCanReadWorkTeamAuditLog(actor)
    await this.requireTeam(workspacePublicId, teamPublicId)
    return this.audit.listByTeam(workspacePublicId, teamPublicId, pagination)
  }
}
