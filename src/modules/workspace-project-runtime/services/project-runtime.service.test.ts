import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { defaultInitialConfigurationSummary } from "../domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../domain/workspace-runtime-project.js"
import { ProjectRuntimeNotFoundError } from "../domain/project-runtime.errors.js"
import type { ProjectRuntimeRepository } from "../persistence/project-runtime.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import { ProjectRuntimeService } from "./project-runtime.service.js"

function sampleRow(overrides: Partial<WorkspaceRuntimeProjectState> = {}): WorkspaceRuntimeProjectState {
  const now = new Date(0)
  return {
    projectPublicId: "p-a",
    workspacePublicId: "w-test",
    sourceDraftPublicId: "d-a",
    projectName: "Alpha",
    operationalApproach: "scrum",
    initialConfigurationSummary: defaultInitialConfigurationSummary("scrum"),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("ProjectRuntimeService team-scoped listing", () => {
  it("filters list to team-linked projects for scrum_developer", async () => {
    const rows = [sampleRow({ projectPublicId: "p-a" }), sampleRow({ projectPublicId: "p-b", projectName: "B" })]
    const repo: ProjectRuntimeRepository = {
      async listByWorkspacePublicId() {
        return rows
      },
    } as Pick<ProjectRuntimeRepository, "listByWorkspacePublicId"> as ProjectRuntimeRepository

    const membership: WorkTeamMembershipRepository = {
      async listActiveTeamPublicIdsForUserInWorkspace() {
        return ["team-1"]
      },
    } as Pick<WorkTeamMembershipRepository, "listActiveTeamPublicIdsForUserInWorkspace"> as WorkTeamMembershipRepository

    const links: WorkTeamProjectLinkRepository = {
      async listDistinctProjectPublicIdsForTeams(_w, teamIds) {
        assert.deepEqual(teamIds, ["team-1"])
        return ["p-b"]
      },
    } as Pick<WorkTeamProjectLinkRepository, "listDistinctProjectPublicIdsForTeams"> as WorkTeamProjectLinkRepository

    const svc = new ProjectRuntimeService(repo, membership, links)
    const actor = minimalWorkspaceMember({
      workspacePublicId: "w-test",
      userPublicId: "u-1",
      workspaceRoleMethodological: "scrum_developer",
    })
    const list = await svc.listWorkspaceRuntimeProjectsForWorkspace(actor, "w-test")
    assert.equal(list.length, 1)
    assert.equal(list[0]?.projectPublicId, "p-b")
  })

  it("returns full workspace list for admin", async () => {
    const rows = [sampleRow({ projectPublicId: "p-a" }), sampleRow({ projectPublicId: "p-b", projectName: "B" })]
    const repo: ProjectRuntimeRepository = {
      async listByWorkspacePublicId() {
        return rows
      },
    } as Pick<ProjectRuntimeRepository, "listByWorkspacePublicId"> as ProjectRuntimeRepository

    let membershipsCalled = false
    const membership: WorkTeamMembershipRepository = {
      async listActiveTeamPublicIdsForUserInWorkspace() {
        membershipsCalled = true
        return []
      },
    } as Pick<WorkTeamMembershipRepository, "listActiveTeamPublicIdsForUserInWorkspace"> as WorkTeamMembershipRepository

    const links: WorkTeamProjectLinkRepository = {
      async listDistinctProjectPublicIdsForTeams() {
        throw new Error("should not resolve team links for workspace-wide actor")
      },
    } as Pick<WorkTeamProjectLinkRepository, "listDistinctProjectPublicIdsForTeams"> as WorkTeamProjectLinkRepository

    const svc = new ProjectRuntimeService(repo, membership, links)
    const actor = minimalWorkspaceMember({
      workspacePublicId: "w-test",
      workspaceRoleAdministrative: "admin",
    })
    const list = await svc.listWorkspaceRuntimeProjectsForWorkspace(actor, "w-test")
    assert.equal(list.length, 2)
    assert.equal(membershipsCalled, false)
  })

  it("getProjectRuntimeSummary returns 404 for off-team project when developer", async () => {
    const row = sampleRow({ projectPublicId: "p-secret" })
    const repo: ProjectRuntimeRepository = {
      async findByWorkspaceAndProjectPublicId() {
        return row
      },
    } as Pick<ProjectRuntimeRepository, "findByWorkspaceAndProjectPublicId"> as ProjectRuntimeRepository

    const membership: WorkTeamMembershipRepository = {
      async listActiveTeamPublicIdsForUserInWorkspace() {
        return ["t1"]
      },
    } as Pick<WorkTeamMembershipRepository, "listActiveTeamPublicIdsForUserInWorkspace"> as WorkTeamMembershipRepository

    const links: WorkTeamProjectLinkRepository = {
      async listDistinctProjectPublicIdsForTeams() {
        return ["p-other"]
      },
    } as Pick<WorkTeamProjectLinkRepository, "listDistinctProjectPublicIdsForTeams"> as WorkTeamProjectLinkRepository

    const svc = new ProjectRuntimeService(repo, membership, links)
    const actor = minimalWorkspaceMember({
      workspacePublicId: "w-test",
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () => svc.getProjectRuntimeSummary(actor, "w-test", "p-secret"),
      ProjectRuntimeNotFoundError,
    )
  })
})
