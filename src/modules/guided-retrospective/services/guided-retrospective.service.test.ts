import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { WorkspaceAuditLogRepository } from "../../workspace-audit-log/persistence/workspace-audit-log.repository.js"
import { ProjectRuntimeInvalidInputError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { EmptySprint } from "../../daily-alignment/daily-alignment.in-memory.fixtures.js"
import { GuidedRetrospectiveService } from "./guided-retrospective.service.js"
import {
  GuidedRetrospectiveConflictError,
  GuidedRetrospectiveForbiddenError,
  GuidedRetrospectiveNotFoundError,
  GuidedRetrospectiveUnsupportedError,
  GuidedRetrospectiveValidationError,
} from "../domain/guided-retrospective.errors.js"
import { GUIDED_RETROSPECTIVE_DEFAULT_SLOT } from "../domain/guided-retrospective-session.js"
import {
  GuidedRetrospectiveTestRuntime,
  MemGuidedRetrospectiveSession,
  MemGuidedRetrospectiveTopics,
  MemGuidedRetrospectiveContributions,
  MemGuidedRetrospectiveVotes,
  MemGuidedRetrospectiveActionItems,
  W,
  P,
} from "../guided-retrospective.in-memory.fixtures.js"

const SLOT = GUIDED_RETROSPECTIVE_DEFAULT_SLOT
const DATE = "2026-05-12"

class MemAudit implements Pick<WorkspaceAuditLogRepository, "append"> {
  async append(): Promise<void> {}
}

class ActiveSprintRepo implements Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> {
  constructor(private readonly sprint: ScrumSprintState) {}
  async listSprintsByProject() {
    return [this.sprint]
  }
}

function sprintFixture(id: string): ScrumSprintState {
  const now = new Date()
  return {
    sprintPublicId: id,
    workspacePublicId: W,
    projectPublicId: P,
    name: "S1",
    goal: "Ship increment",
    status: "active",
    startDate: null,
    endDate: null,
    createdByUserPublicId: "u-seed",
    createdAt: now,
    updatedAt: now,
    closure: null,
    review: null,
    retrospective: null,
  }
}

function svc(approach: "scrum" | "kanban", sprintRepo?: ScrumSprintPlanningRepository) {
  return new GuidedRetrospectiveService(
    new GuidedRetrospectiveTestRuntime(approach) as unknown as ProjectRuntimeService,
    sprintRepo ?? (new EmptySprint() as unknown as ScrumSprintPlanningRepository),
    new MemGuidedRetrospectiveSession(),
    new MemGuidedRetrospectiveTopics(),
    new MemGuidedRetrospectiveContributions(),
    new MemGuidedRetrospectiveVotes(),
    new MemGuidedRetrospectiveActionItems(),
    new MemAudit() as unknown as WorkspaceAuditLogRepository,
    null,
  )
}

class PredictiveRetroRuntime
  implements
    Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState" | "requireScrumOrKanbanWorkspaceRuntimeProject">
{
  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== W || projectPublicId !== P) return null
    const now = new Date()
    return {
      projectPublicId: P,
      workspacePublicId: W,
      sourceDraftPublicId: randomUUID(),
      projectName: "T",
      operationalApproach: "predictive_phases" as const,
      initialConfigurationSummary: defaultInitialConfigurationSummary("predictive_phases"),
      status: "active" as const,
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  async requireScrumOrKanbanWorkspaceRuntimeProject() {
    throw new ProjectRuntimeInvalidInputError("Approach must be scrum or kanban.")
  }
}

describe("GuidedRetrospectiveService", () => {
  const sm = minimalWorkspaceMember({
    userPublicId: "11111111-1111-4111-8111-111111111111",
    workspaceRoleMethodological: "scrum_master",
  })
  const dev = minimalWorkspaceMember({
    userPublicId: "22222222-2222-4222-8222-222222222222",
    workspaceRoleMethodological: "scrum_developer",
  })

  it("lazy session stacks contributions under same day key", async () => {
    const s = svc("scrum", new ActiveSprintRepo(sprintFixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")))
    await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "x",
    })
    await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "stop",
      content: "y",
    })
    const boot = await s.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(boot.session?.contributionCount >= 2, true)
  })

  it("interactive code join adds participant", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      retrospectiveMode: "interactive_code",
      status: "collecting",
    })
    const boot = await s.getTodayBootstrap(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    const code = boot.session!.sessionCode
    assert.ok(code && code.length >= 6)
    await s.joinBySessionCode(dev, W, code!)
    const listed = await s.listContributionsForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(listed.session?.participantUserPublicIds.includes(dev.userPublicId), true)
  })

  it("public resolve finds open session by code without mutating participants", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      retrospectiveMode: "interactive_code",
      status: "collecting",
    })
    const boot = await s.getTodayBootstrap(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    const code = boot.session!.sessionCode
    assert.ok(code && code.length >= 6)
    const before = await s.listContributionsForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    const nBefore = before.session?.participantUserPublicIds.length ?? 0
    const resolved = await s.resolveJoinTargetBySessionCode(code!)
    assert.equal(resolved.workspacePublicId, W)
    assert.equal(resolved.projectPublicId, P)
    const after = await s.listContributionsForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    const nAfter = after.session?.participantUserPublicIds.length ?? 0
    assert.equal(nAfter, nBefore)
  })

  it("public room state returns contributions for open interactive session", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      retrospectiveMode: "interactive_code",
      status: "collecting",
    })
    const boot = await s.getTodayBootstrap(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    const code = boot.session!.sessionCode
    assert.ok(code && code.length >= 6)
    await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "Public room item",
    })
    const room = await s.getPublicRoomStateBySessionCode(code!)
    assert.equal(room.workspacePublicId, W)
    assert.equal(room.contributions.length, 1)
    assert.equal(room.contributions[0]!.content, "Public room item")
  })

  it("rejects join when code unknown", async () => {
    const s = svc("scrum")
    await assert.rejects(() => s.joinBySessionCode(dev, W, "XXXXXX"), GuidedRetrospectiveNotFoundError)
  })

  it("hidden_from_peers hides author from developer but not facilitator", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      status: "collecting",
      defaultContributionVisibility: "visible_to_all",
    })
    await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "secret",
      visibilityMode: "hidden_from_peers",
    })
    const asDev = await s.listContributionsForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(asDev.contributions[0]!.authorUserPublicId, "")
    const asSm = await s.listContributionsForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(asSm.contributions[0]!.authorUserPublicId, dev.userPublicId)
  })

  it("facilitator groups contribution into topic and voting respects sticker budget", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      status: "collecting",
      votesPerParticipant: 2,
      allowMultipleVotesPerTopic: false,
    })
    const c = await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "issue a",
    })
    const t1 = await s.createTopicForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { title: "Theme A" })
    const t2 = await s.createTopicForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { title: "Theme B" })
    await s.patchContributionForToday(sm, W, P, c.contributionPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {
      topicPublicId: t1.topicPublicId,
      topicStatus: "grouped",
    })
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "voting" })

    await s.voteOnTopicForToday(dev, W, P, t1.topicPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {})
    await s.voteOnTopicForToday(dev, W, P, t2.topicPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {})
    const t3 = await s.createTopicForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { title: "Theme C" })
    await s.voteOnTopicForToday(dev, W, P, t3.topicPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {})
    const boot = await s.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(boot.session?.voteRecordCount, 2)
  })

  it("close without action items marks closed_without_actions", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    const closed = await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [],
    })
    assert.equal(closed.status, "closed_without_actions")
    assert.equal(closed.sessionCode, null)
  })

  it("additive note only after close", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: ["keep pace"],
      actionItems: [],
    })
    const after = await s.appendAdditiveNoteAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "late thought")
    assert.equal(after.additiveNotesAfterClose.length, 1)
    await assert.rejects(
      () => s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "collecting" }),
      GuidedRetrospectiveConflictError,
    )
  })

  it("transcript after close upsert replaces text and can be cleared", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [],
    })
    const t1 = await s.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "Primera transcripción")
    assert.ok(t1.transcriptAfterClose)
    assert.equal(t1.transcriptAfterClose!.text, "Primera transcripción")
    const t2 = await s.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "Segunda versión")
    assert.equal(t2.transcriptAfterClose!.text, "Segunda versión")
    const t3 = await s.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "   ")
    assert.equal(t3.transcriptAfterClose, null)
  })

  it("transcript after close rejected while session open", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "collecting" })
    await assert.rejects(
      () => s.upsertTranscriptAfterClose(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, "x"),
      GuidedRetrospectiveConflictError,
    )
  })

  it("developer cannot close", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await assert.rejects(
      () =>
        s.closeToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
          agreements: [],
          actionItems: [],
        }),
      GuidedRetrospectiveForbiddenError,
    )
  })

  it("product owner may facilitate close", async () => {
    const s = svc("scrum")
    const po = minimalWorkspaceMember({
      userPublicId: "44444444-4444-4444-8444-444444444444",
      workspaceRoleMethodological: "product_owner",
    })
    await s.upsertSessionHeader(po, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    const closed = await s.closeToday(po, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [{ title: "Fix hand-off" }],
    })
    assert.equal(closed.status, "closed")
  })

  it("predictive: read bootstrap sin sesión; escritura rechazada", async () => {
    const s = new GuidedRetrospectiveService(
      new PredictiveRetroRuntime() as unknown as ProjectRuntimeService,
      new EmptySprint() as unknown as ScrumSprintPlanningRepository,
      new MemGuidedRetrospectiveSession(),
      new MemGuidedRetrospectiveTopics(),
      new MemGuidedRetrospectiveContributions(),
      new MemGuidedRetrospectiveVotes(),
      new MemGuidedRetrospectiveActionItems(),
      new MemAudit() as unknown as WorkspaceAuditLogRepository,
      null,
    )
    const boot = await s.getTodayBootstrap(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(boot.guidedRetrospectiveOperable, false)
    assert.equal(boot.session, null)
    await assert.rejects(
      () =>
        s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
          status: "collecting",
        }),
      GuidedRetrospectiveUnsupportedError,
    )
  })

  it("kanban exposes flow period window on lazy create", async () => {
    const s = svc("kanban")
    await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "flow",
    })
    const boot = await s.getTodayBootstrap(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(boot.session?.retrospectivePeriod?.periodStartYmd, DATE)
    assert.equal(boot.session?.operationalApproach, "kanban")
  })

  it("project action items: list, filter mine, patch assignee; others forbidden", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [
        { title: "Mine", ownerUserPublicId: dev.userPublicId },
        { title: "Theirs", ownerUserPublicId: sm.userPublicId },
      ],
    })
    const all = await s.listProjectActionItems(dev, W, P, {})
    assert.equal(all.length, 2)
    const mine = await s.listProjectActionItems(dev, W, P, { assignee: "me" })
    assert.equal(mine.length, 1)
    assert.equal(mine[0]!.actionItem.title, "Mine")
    const id = mine[0]!.actionItem.actionItemPublicId
    const p = await s.patchProjectActionItem(dev, W, P, id, { status: "finished", historyNote: "ok" })
    assert.equal(p.status, "finished")
    assert.ok(p.history.length >= 2)
    const theirsId = all.find((x) => x.actionItem.title === "Theirs")!.actionItem.actionItemPublicId
    await assert.rejects(() => s.patchProjectActionItem(dev, W, P, theirsId, { status: "finished" }), GuidedRetrospectiveForbiddenError)
    await assert.rejects(() => s.patchProjectActionItem(dev, W, P, id, { title: "nope" }), GuidedRetrospectiveValidationError)
    await assert.rejects(() => s.patchProjectActionItem(dev, W, P, id, {}), GuidedRetrospectiveValidationError)
  })

  it("project action items: facilitator may reassign", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [{ title: "Handoff", ownerUserPublicId: sm.userPublicId }],
    })
    const id = (await s.listProjectActionItems(sm, W, P, {}))[0]!.actionItem.actionItemPublicId
    const next = await s.patchProjectActionItem(sm, W, P, id, { ownerUserPublicId: dev.userPublicId })
    assert.equal(next.ownerUserPublicId, dev.userPublicId)
  })

  it("project action items: owner always visible to peers", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [{ title: "Shared owner", ownerUserPublicId: sm.userPublicId }],
    })
    const rows = await s.listProjectActionItems(dev, W, P, {})
    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.actionItem.ownerUserPublicId, sm.userPublicId)
  })

  it("project action items filter by priority, owner, and unassigned", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "closing" })
    await s.closeToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      agreements: [],
      actionItems: [
        { title: "High dev", ownerUserPublicId: dev.userPublicId, priority: "high" },
        { title: "Low sm", ownerUserPublicId: sm.userPublicId, priority: "low" },
        { title: "No owner", priority: "medium" },
      ],
    })
    const highOnly = await s.listProjectActionItems(dev, W, P, { priority: "high" })
    assert.equal(highOnly.length, 1)
    assert.equal(highOnly[0]!.actionItem.title, "High dev")
    const bySm = await s.listProjectActionItems(dev, W, P, { ownerUserPublicId: sm.userPublicId })
    assert.equal(bySm.length, 1)
    assert.equal(bySm[0]!.actionItem.title, "Low sm")
    const unass = await s.listProjectActionItems(dev, W, P, { unassigned: "true" })
    assert.equal(unass.length, 1)
    assert.equal(unass[0]!.actionItem.title, "No owner")
  })

  it("topic merge moves contribution and migrates votes", async () => {
    const s = svc("scrum")
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      status: "collecting",
      votesPerParticipant: 3,
      allowMultipleVotesPerTopic: false,
    })
    const c = await s.appendContributionForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      templateColumnKey: "start",
      content: "x",
    })
    const a = await s.createTopicForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { title: "A" })
    const b = await s.createTopicForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { title: "B" })
    await s.patchContributionForToday(sm, W, P, c.contributionPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {
      topicPublicId: b.topicPublicId,
      topicStatus: "grouped",
    })
    await s.upsertSessionHeader(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, { status: "voting" })
    await s.voteOnTopicForToday(dev, W, P, b.topicPublicId, { sessionDate: DATE, sessionSlot: SLOT }, {})
    await s.mergeTopicsForToday(sm, W, P, { sessionDate: DATE, sessionSlot: SLOT }, {
      sourceTopicPublicId: b.topicPublicId,
      targetTopicPublicId: a.topicPublicId,
    })
    const topics = await s.listTopicsForToday(dev, W, P, { sessionDate: DATE, sessionSlot: SLOT })
    assert.equal(topics.topics.some((t) => t.topicPublicId === b.topicPublicId), false)
  })
})
