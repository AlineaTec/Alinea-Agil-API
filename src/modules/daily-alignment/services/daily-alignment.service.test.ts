import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import { DailyAlignmentService } from "./daily-alignment.service.js"
import { DailyAlignmentConflictError, DailyAlignmentUnsupportedError } from "../domain/daily-alignment.errors.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { DAILY_ALIGNMENT_DEFAULT_SLOT } from "../domain/daily-alignment-session.js"
import {
  EmptySprint,
  EmptyTeamLink,
  EmptyTeamMembership,
  FakeProjectRuntime,
  MemAudit,
  MemParticipant,
  MemSession,
  MemTime,
  MemWorkspaceMembers,
  P,
  W,
} from "../daily-alignment.in-memory.fixtures.js"

describe("daily-alignment.service", () => {
  it("lazy-creates session on first my-update (kanban)", async () => {
    const sessions = new MemSession()
    const participants = new MemParticipant()
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("kanban") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      sessions,
      participants,
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-dev",
          workspaceRoleMethodological: "scrum_developer",
        }),
      ]) as unknown as WorkspaceMemberRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await svc.upsertMyUpdate(
      dev,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        yesterdaySummary: "K",
        todayPlan: "L",
        impediments: "",
        confirmedFromSuggestion: false,
      },
    )
    assert.equal(sessions.sessions.size, 1)
  })

  it("lazy-creates session on first my-update (scrum)", async () => {
    const sessions = new MemSession()
    const participants = new MemParticipant()
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      sessions,
      participants,
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-dev",
          workspaceRoleMethodological: "scrum_developer",
        }),
      ]) as unknown as WorkspaceMemberRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const r = await svc.upsertMyUpdate(
      dev,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        yesterdaySummary: "A",
        todayPlan: "B",
        impediments: "",
        confirmedFromSuggestion: false,
      },
    )
    assert.equal(sessions.sessions.size, 1)
    assert.equal(r.session.status, "open")
    assert.equal(r.update.isSubmitted, true)
  })

  it("closes complete when all expected roles submitted", async () => {
    const sessions = new MemSession()
    const participants = new MemParticipant()
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      sessions,
      participants,
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-dev",
          workspaceRoleMethodological: "scrum_developer",
        }),
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-sm",
          workspaceRoleMethodological: "scrum_master",
        }),
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-po",
          workspaceRoleMethodological: "product_owner",
        }),
      ]) as unknown as WorkspaceMemberRepository,
    )
    const body = {
      yesterdaySummary: "x",
      todayPlan: "y",
      impediments: "",
      confirmedFromSuggestion: false,
    }
    await svc.upsertMyUpdate(
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: "u-dev",
        workspaceRoleMethodological: "scrum_developer",
      }),
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      body,
    )
    await svc.upsertMyUpdate(
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: "u-sm",
        workspaceRoleMethodological: "scrum_master",
      }),
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      body,
    )
    await svc.upsertMyUpdate(
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: "u-po",
        workspaceRoleMethodological: "product_owner",
      }),
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      body,
    )
    const closed = await svc.closeSession(
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: "u-sm",
        workspaceRoleMethodological: "scrum_master",
      }),
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      { generalSummary: "done", agreements: [], escalatedImpediments: [], followUps: [] },
    )
    assert.equal(closed.status, "closed")
  })

  it("closes incomplete when expected participant missing", async () => {
    const sessions = new MemSession()
    const participants = new MemParticipant()
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      sessions,
      participants,
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-dev",
          workspaceRoleMethodological: "scrum_developer",
        }),
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-sm",
          workspaceRoleMethodological: "scrum_master",
        }),
      ]) as unknown as WorkspaceMemberRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await svc.upsertMyUpdate(
      dev,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        yesterdaySummary: "x",
        todayPlan: "y",
        impediments: "",
        confirmedFromSuggestion: false,
      },
    )
    const sm = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-sm",
      workspaceRoleMethodological: "scrum_master",
    })
    const closed = await svc.closeSession(
      sm,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        generalSummary: "ok",
        agreements: [],
        escalatedImpediments: [],
        followUps: [],
      },
    )
    assert.equal(closed.status, "closed_incomplete")
  })

  it("rejects mutations for predictive_phases", async () => {
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("predictive_phases") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemSession(),
      new MemParticipant(),
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([]) as unknown as WorkspaceMemberRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    await assert.rejects(
      () =>
        svc.upsertMyUpdate(
          dev,
          W,
          P,
          { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
          {
            yesterdaySummary: "a",
            todayPlan: "b",
            impediments: "",
            confirmedFromSuggestion: false,
          },
        ),
      DailyAlignmentUnsupportedError,
    )
  })

  it("blocks participant edit after close", async () => {
    const sessions = new MemSession()
    const participants = new MemParticipant()
    const svc = new DailyAlignmentService(
      new FakeProjectRuntime("scrum") as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      sessions,
      participants,
      new MemTime(0),
      new MemAudit(),
      new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
      new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
      new MemWorkspaceMembers([
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-dev",
          workspaceRoleMethodological: "scrum_developer",
        }),
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-sm",
          workspaceRoleMethodological: "scrum_master",
        }),
        minimalWorkspaceMember({
          workspacePublicId: W,
          userPublicId: "u-po",
          workspaceRoleMethodological: "product_owner",
        }),
      ]) as unknown as WorkspaceMemberRepository,
    )
    const dev = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const sm = minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: "u-sm",
      workspaceRoleMethodological: "scrum_master",
    })
    await svc.upsertMyUpdate(
      dev,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        yesterdaySummary: "x",
        todayPlan: "y",
        impediments: "",
        confirmedFromSuggestion: false,
      },
    )
    await svc.upsertMyUpdate(
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: "u-po",
        workspaceRoleMethodological: "product_owner",
      }),
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      { yesterdaySummary: "p", todayPlan: "q", impediments: "", confirmedFromSuggestion: false },
    )
    await svc.closeSession(
      sm,
      W,
      P,
      { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
      {
        generalSummary: "fin",
        agreements: [],
        escalatedImpediments: [],
        followUps: [],
      },
    )
    await assert.rejects(
      () =>
        svc.upsertMyUpdate(
          dev,
          W,
          P,
          { sessionDate: "2026-05-10", sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT },
          {
            yesterdaySummary: "z",
            todayPlan: "z",
            impediments: "",
            confirmedFromSuggestion: false,
          },
        ),
      DailyAlignmentConflictError,
    )
  })
})
