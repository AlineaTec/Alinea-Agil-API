import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { randomUUID } from "node:crypto"
import type { DailyAlignmentSessionState } from "../../daily-alignment/domain/daily-alignment-session.js"
import {
  DAILY_ALIGNMENT_FIXTURE_PROJECT,
  DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
  FakeProjectRuntime,
  MemSession,
} from "../../daily-alignment/daily-alignment.in-memory.fixtures.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { ProjectRuntimeForbiddenError } from "../domain/project-runtime.errors.js"
import { ProjectRuntimeService } from "./project-runtime.service.js"
import type { ProjectRuntimeRepository } from "../persistence/project-runtime.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import { defaultInitialConfigurationSummary } from "../domain/initial-configuration-summary.js"
import { AlignmentSessionsReportService } from "./alignment-sessions-report.service.js"

const SPRINT_ID = "33333333-3333-4333-8333-333333333333"

function baseSession(partial: Partial<DailyAlignmentSessionState> = {}): DailyAlignmentSessionState {
  const now = new Date("2025-06-01T12:00:00.000Z")
  return {
    sessionPublicId: randomUUID(),
    workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
    projectPublicId: DAILY_ALIGNMENT_FIXTURE_PROJECT,
    sessionDate: "2025-06-15",
    sessionSlot: "default",
    sprintPublicId: SPRINT_ID,
    operationalApproach: "scrum",
    operationalTimeZone: "UTC",
    alignmentMode: "live",
    facilitatorUserPublicId: "fac-1",
    status: "closed",
    startedAt: now,
    closedAt: now,
    closeoutSummary: "OK",
    facilitatorTranscript: null,
    agreements: ["a"],
    escalatedImpediments: [],
    followUps: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

function sprintState(): ScrumSprintState {
  const now = new Date(0)
  return {
    sprintPublicId: SPRINT_ID,
    workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
    projectPublicId: DAILY_ALIGNMENT_FIXTURE_PROJECT,
    name: "S1",
    goal: "g",
    status: "active",
    startDate: new Date("2025-06-10T00:00:00.000Z"),
    endDate: new Date("2025-06-20T23:59:59.999Z"),
    createdByUserPublicId: "u",
    createdAt: now,
    updatedAt: now,
    closure: null,
    review: null,
    retrospective: null,
  }
}

describe("AlignmentSessionsReportService", () => {
  it("lists sessions in UTC date range ordered by date and slot", async () => {
    const mem = new MemSession()
    await mem.insert(baseSession({ sessionDate: "2025-06-12", sessionSlot: "b" }))
    await mem.insert(baseSession({ sessionDate: "2025-06-11", sessionSlot: "a" }))
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "findSprintByPublicId" | "listSprintsByProject"> = {
      async findSprintByPublicId() {
        return null
      },
      async listSprintsByProject() {
        return []
      },
    }
    const members: Pick<WorkspaceMemberRepository, "listByWorkspacePublicId"> = {
      async listByWorkspacePublicId() {
        return [
          minimalWorkspaceMember({
            workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
            userPublicId: "fac-1",
            fullName: "Fac One",
          }),
        ]
      },
    }
    const pr = new ProjectRuntimeService(
      {
        async findByWorkspaceAndProjectPublicId() {
          return {
            projectPublicId: DAILY_ALIGNMENT_FIXTURE_PROJECT,
            workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
            sourceDraftPublicId: randomUUID(),
            projectName: "Proj",
            operationalApproach: "kanban",
            initialConfigurationSummary: defaultInitialConfigurationSummary("kanban"),
            status: "active",
            materializedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        },
      } as Pick<ProjectRuntimeRepository, "findByWorkspaceAndProjectPublicId"> as ProjectRuntimeRepository,
      { async listActiveTeamPublicIdsForUserInWorkspace() {
        return []
      } } as WorkTeamMembershipRepository,
      { async listDistinctProjectPublicIdsForTeams() {
        return []
      } } as WorkTeamProjectLinkRepository,
    )

    const svc = new AlignmentSessionsReportService(
      pr,
      mem,
      sprintRepo as ScrumSprintPlanningRepository,
      members as WorkspaceMemberRepository,
    )
    const actor = minimalWorkspaceMember({
      workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
      workspaceRoleMethodological: "scrum_master",
    })
    const r = await svc.getReport(actor, DAILY_ALIGNMENT_FIXTURE_WORKSPACE, DAILY_ALIGNMENT_FIXTURE_PROJECT, {
      dateFrom: "2025-06-10",
      dateTo: "2025-06-15",
    })
    assert.equal(r.totalSessionCount, 2)
    assert.equal(r.rows[0]?.sessionDate, "2025-06-11")
    assert.equal(r.rows[1]?.sessionDate, "2025-06-12")
    assert.equal(r.rows[1]?.facilitatorFullName, "Fac One")
    assert.deepEqual(r.rows[1]?.agreements, ["a"])
    assert.equal(r.rows[1]?.operationalApproach, "scrum")
    assert.equal(r.rows[1]?.sprintName, null)
  })

  it("uses sprint calendar bounds for scrum sprint scope", async () => {
    const mem = new MemSession()
    await mem.insert(baseSession({ sessionDate: "2025-06-09" }))
    await mem.insert(baseSession({ sessionDate: "2025-06-15" }))
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "findSprintByPublicId" | "listSprintsByProject"> = {
      async findSprintByPublicId() {
        return sprintState()
      },
      async listSprintsByProject() {
        return [sprintState()]
      },
    }
    const members: Pick<WorkspaceMemberRepository, "listByWorkspacePublicId"> = {
      async listByWorkspacePublicId() {
        return []
      },
    }
    const fr = new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService
    const svc = new AlignmentSessionsReportService(
      fr,
      mem,
      sprintRepo as ScrumSprintPlanningRepository,
      members as WorkspaceMemberRepository,
    )
    const actor = minimalWorkspaceMember({
      workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
      workspaceRoleMethodological: "product_owner",
    })
    const r = await svc.getReport(actor, DAILY_ALIGNMENT_FIXTURE_WORKSPACE, DAILY_ALIGNMENT_FIXTURE_PROJECT, {
      sprintPublicId: SPRINT_ID,
    })
    assert.equal(r.scope.kind, "sprint")
    assert.equal(r.totalSessionCount, 1)
    assert.equal(r.rows[0]?.sessionDate, "2025-06-15")
    assert.equal(r.rows[0]?.sprintName, "S1")
  })

  it("rejects scrum_developer", async () => {
    const mem = new MemSession()
    const sprintRepo = {
      async findSprintByPublicId() {
        return null
      },
      async listSprintsByProject() {
        return []
      },
    } as Pick<ScrumSprintPlanningRepository, "findSprintByPublicId" | "listSprintsByProject"> as ScrumSprintPlanningRepository
    const members = {
      async listByWorkspacePublicId() {
        return []
      },
    } as WorkspaceMemberRepository
    const fr = new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService
    const svc = new AlignmentSessionsReportService(fr, mem, sprintRepo, members)
    const actor = minimalWorkspaceMember({
      workspacePublicId: DAILY_ALIGNMENT_FIXTURE_WORKSPACE,
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () =>
        svc.getReport(actor, DAILY_ALIGNMENT_FIXTURE_WORKSPACE, DAILY_ALIGNMENT_FIXTURE_PROJECT, {
          dateFrom: "2025-06-01",
          dateTo: "2025-06-02",
        }),
      ProjectRuntimeForbiddenError,
    )
  })
})
