import { randomUUID } from "node:crypto"
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { initialConfigurationSummaryAfterMaterialization } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { W, P, MemSession } from "../../daily-alignment/daily-alignment.in-memory.fixtures.js"
import {
  MemGspSession,
  MemRefinementReviews,
  MemSprintRepo,
  SPRINT,
} from "../../guided-sprint-planning/guided-sprint-planning.in-memory.fixtures.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type { GuidedRefinementSessionRepository } from "../../guided-refinement/persistence/guided-refinement-session.repository.js"
import type { GuidedReviewSessionRepository } from "../../guided-review/persistence/guided-review-session.repository.js"
import type { GuidedRetrospectiveSessionRepository } from "../../guided-retrospective/persistence/guided-retrospective-session.repository.js"
import type { GuidedRetrospectiveActionItemRepository } from "../../guided-retrospective/persistence/guided-retrospective-action-item.repository.js"
import type { ImpedimentRepository } from "../../project-impediments/persistence/impediment.repository.js"
import type { OperatingSnapshotNbaSnoozeRepository } from "../persistence/operating-snapshot-nba-snooze.repository.js"
import { OperatingSnapshotService } from "./operating-snapshot.service.js"
import { OperatingSnapshotCache } from "./operating-snapshot-cache.js"
import { resolveScrumFocusCycle } from "../domain/focus-cycle-resolver.js"
import { isDailyPendingThresholdReached } from "../domain/snapshot-temporal.js"
import { deriveWizardStage } from "../domain/wizard-stage-derivation.js"

export class SnapshotTestRuntime implements Pick<ProjectRuntimeService, "findWorkspaceRuntimeProjectState" | "getProjectRuntimeSummary"> {
  constructor(
    private readonly approach: WorkspaceRuntimeProjectState["operationalApproach"] = "scrum",
    private readonly status: WorkspaceRuntimeProjectState["status"] = "active",
  ) {}

  private state(): WorkspaceRuntimeProjectState {
    const now = new Date()
    return {
      projectPublicId: P,
      workspacePublicId: W,
      sourceDraftPublicId: randomUUID(),
      projectName: "Snapshot Test",
      operationalApproach: this.approach,
      initialConfigurationSummary: initialConfigurationSummaryAfterMaterialization(this.approach),
      status: this.status,
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    }
  }

  async findWorkspaceRuntimeProjectState(workspacePublicId: string, projectPublicId: string) {
    if (workspacePublicId !== W || projectPublicId !== P) return null
    return this.state()
  }

  async getProjectRuntimeSummary(actor: WorkspaceMemberState, workspacePublicId: string, projectPublicId: string) {
    const row = await this.findWorkspaceRuntimeProjectState(workspacePublicId, projectPublicId)
    if (!row) throw new Error("not found")
    return {
      projectPublicId: row.projectPublicId,
      workspacePublicId: row.workspacePublicId,
      sourceDraftPublicId: row.sourceDraftPublicId,
      projectName: row.projectName,
      operationalApproach: row.operationalApproach,
      initialConfigurationSummary: row.initialConfigurationSummary,
      charterSummary: null,
      status: row.status,
      materializedAt: row.materializedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

class EmptySessionRepo {
  async listRecentForProject() {
    return []
  }
  async listForProjectSessionDateRange() {
    return []
  }
}

class MemImpediments implements ImpedimentRepository {
  async insert() {}
  async replace() {}
  async findByProjectAndId() {
    return null
  }
  async listByProject(_ws: string, _proj: string, filters: { severity?: string }) {
    if (filters.severity === "critical") {
      return { items: [], totalCount: 1 }
    }
    return { items: [], totalCount: 2 }
  }
}

class MemSnooze implements OperatingSnapshotNbaSnoozeRepository {
  rows: Array<{
    workspacePublicId: string
    projectPublicId: string
    userPublicId: string
    snoozeKey: string
    snoozedUntilOperationalDate: string
  }> = []

  async upsert(state: {
    workspacePublicId: string
    projectPublicId: string
    userPublicId: string
    snoozeKey: string
    snoozedUntilOperationalDate: string
  }) {
    this.rows = this.rows.filter(
      (r) =>
        !(
          r.workspacePublicId === state.workspacePublicId &&
          r.projectPublicId === state.projectPublicId &&
          r.userPublicId === state.userPublicId &&
          r.snoozeKey === state.snoozeKey
        ),
    )
    this.rows.push(state)
  }

  async listActiveForUserProject(ws: string, proj: string, user: string, ymd: string) {
    return this.rows
      .filter(
        (r) =>
          r.workspacePublicId === ws &&
          r.projectPublicId === proj &&
          r.userPublicId === user &&
          r.snoozedUntilOperationalDate >= ymd,
      )
      .map((r) => ({
        snoozePublicId: randomUUID(),
        ...r,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
  }

  async deleteExpiredBefore() {
    return 0
  }
}

function sprintFixture(status: ScrumSprintState["status"], overrides: Partial<ScrumSprintState> = {}): ScrumSprintState {
  const now = new Date()
  return {
    sprintPublicId: SPRINT,
    workspacePublicId: W,
    projectPublicId: P,
    name: "Sprint 1",
    goal: "Goal",
    status,
    startDate: new Date("2026-05-12T00:00:00.000Z"),
    endDate: new Date("2026-05-26T00:00:00.000Z"),
    createdByUserPublicId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    closure: null,
    review: null,
    retrospective: null,
    ...overrides,
  }
}

function smActor(): WorkspaceMemberState {
  return {
    membershipPublicId: randomUUID(),
    workspacePublicId: W,
    userPublicId: randomUUID(),
    emailNormalized: "sm@test.com",
    fullName: "SM",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: "scrum_master",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function buildService(
  sprintRepo: MemSprintRepo,
  runtime = new SnapshotTestRuntime(),
  snooze = new MemSnooze(),
  cache = new OperatingSnapshotCache(),
) {
  return new OperatingSnapshotService(
    runtime as unknown as ProjectRuntimeService,
    sprintRepo as never,
    new MemGspSession(),
    new EmptySessionRepo() as unknown as GuidedRefinementSessionRepository,
    new MemRefinementReviews(),
    new MemSession(),
    new EmptySessionRepo() as unknown as GuidedReviewSessionRepository,
    new EmptySessionRepo() as unknown as GuidedRetrospectiveSessionRepository,
    { listByProject: async () => [] } as unknown as GuidedRetrospectiveActionItemRepository,
    new MemImpediments(),
    snooze,
    cache,
  )
}

describe("focus-cycle-resolver", () => {
  it("prefers active sprint", () => {
    const active = sprintFixture("active", { sprintPublicId: "a" })
    const planning = sprintFixture("planning", { sprintPublicId: "p" })
    const res = resolveScrumFocusCycle({
      sprints: [planning, active],
      todayYmd: "2026-05-19",
      timeZone: "UTC",
      planningSessionBySprintId: new Map(),
    })
    assert.equal(res.publicId, "a")
    assert.equal(res.resolutionReason, "active_sprint")
  })

  it("uses latest planning when no active", () => {
    const p1 = sprintFixture("planning", { sprintPublicId: "p1", updatedAt: new Date("2026-05-01") })
    const p2 = sprintFixture("planning", { sprintPublicId: "p2", updatedAt: new Date("2026-05-10") })
    const res = resolveScrumFocusCycle({
      sprints: [p1, p2],
      todayYmd: "2026-05-19",
      timeZone: "UTC",
      planningSessionBySprintId: new Map(),
    })
    assert.equal(res.publicId, "p2")
  })

  it("marks closed stale beyond 14 days", () => {
    const closed = sprintFixture("closed", {
      endDate: new Date("2026-04-01T00:00:00.000Z"),
    })
    const res = resolveScrumFocusCycle({
      sprints: [closed],
      todayYmd: "2026-05-19",
      timeZone: "UTC",
      planningSessionBySprintId: new Map(),
    })
    assert.equal(res.status, "closed")
    assert.equal(res.isStale, true)
  })
})

describe("wizard-stage-derivation", () => {
  it("execute wins over review pending on another sprint", () => {
    const focus = resolveScrumFocusCycle({
      sprints: [sprintFixture("active")],
      todayYmd: "2026-05-19",
      timeZone: "UTC",
      planningSessionBySprintId: new Map(),
    })
    const stage = deriveWizardStage({
      approach: "scrum",
      configurationSummary: initialConfigurationSummaryAfterMaterialization("scrum"),
      focusCycle: focus,
      hasActiveSprint: true,
      planningSessionOpen: false,
      planningSessionClosed: true,
      dailyTodayClosed: false,
      reviewPendingForFocus: false,
      retroPendingForFocus: false,
      openRetroActionCount: 0,
      overdueRetroActionCount: 0,
      backlogReadyCount: 0,
      archived: false,
    })
    assert.equal(stage, "execute")
  })
})

describe("snapshot-temporal", () => {
  it("daily pending threshold at 14:00 UTC weekday", () => {
    const before = new Date("2026-05-19T13:59:00.000Z")
    const after = new Date("2026-05-19T14:01:00.000Z")
    assert.equal(isDailyPendingThresholdReached(before, "UTC"), false)
    assert.equal(isDailyPendingThresholdReached(after, "UTC"), true)
  })
})

describe("OperatingSnapshotService", () => {
  it("returns execute stage for active sprint", async () => {
    const sprintRepo = new MemSprintRepo([sprintFixture("active")])
    const svc = buildService(sprintRepo)
    const snap = await svc.getOperatingSnapshot(smActor(), W, P)
    assert.equal(snap.wizardState.stage, "execute")
    assert.equal(snap.focusCycle.status, "active")
    assert.ok(snap.nextBestAction)
  })

  it("archived project has no NBA", async () => {
    const sprintRepo = new MemSprintRepo()
    const svc = buildService(sprintRepo, new SnapshotTestRuntime("scrum", "archived"))
    const snap = await svc.getOperatingSnapshot(smActor(), W, P)
    assert.equal(snap.projectContext.projectLifecycleStatus, "archived")
    assert.equal(snap.nextBestAction, null)
  })

  it("snooze suppresses NBA and invalidates cache", async () => {
    const sprintRepo = new MemSprintRepo([sprintFixture("active")])
    const snooze = new MemSnooze()
    const cache = new OperatingSnapshotCache()
    const svc = buildService(sprintRepo, new SnapshotTestRuntime(), snooze, cache)
    const actor = smActor()
    const first = await svc.getOperatingSnapshot(actor, W, P)
    const key = first.nextBestAction!.dismissSnoozeKey
    await svc.snoozeNba(actor, W, P, { snoozeKey: key, snoozedUntilOperationalDate: "2026-05-19" })
    const second = await svc.getOperatingSnapshot(actor, W, P, { forceRefresh: true })
    assert.equal(second.nextBestAction?.suppressedBySnooze, true)
  })

  it("uses cache within TTL", async () => {
    const sprintRepo = new MemSprintRepo([sprintFixture("active")])
    const cache = new OperatingSnapshotCache()
    const svc = buildService(sprintRepo, new SnapshotTestRuntime(), new MemSnooze(), cache)
    const actor = smActor()
    const a = await svc.getOperatingSnapshot(actor, W, P)
    const b = await svc.getOperatingSnapshot(actor, W, P)
    assert.equal(a.refreshMeta.generatedAt, b.refreshMeta.generatedAt)
  })

  it("counts ready for planning from refinement reviews", async () => {
    const reviews = new MemRefinementReviews()
    const now = new Date()
    reviews.reviews.push({
      reviewedItemPublicId: randomUUID(),
      sessionPublicId: randomUUID(),
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-10",
      workItemPublicId: randomUUID(),
      reviewStatus: "reviewed",
      readyForPlanning: true,
      readyWithObservations: false,
      observations: null,
      businessClarifications: null,
      technicalQuestions: null,
      dependenciesText: null,
      risksText: null,
      estimationStatus: "not_applicable",
      sizeConcern: "none",
      notReadyReasons: [],
      followUpRequired: false,
      reviewedByUserPublicIds: [],
      createdAt: now,
      updatedAt: now,
    })
    const sprintRepo = new MemSprintRepo()
    const svc = new OperatingSnapshotService(
      new SnapshotTestRuntime() as unknown as ProjectRuntimeService,
      sprintRepo as never,
      new MemGspSession(),
      new EmptySessionRepo() as never,
      reviews,
      new MemSession(),
      new EmptySessionRepo() as never,
      new EmptySessionRepo() as never,
      { listByProject: async () => [] } as never,
      new MemImpediments(),
      new MemSnooze(),
      new OperatingSnapshotCache(),
    )
    const snap = await svc.getOperatingSnapshot(smActor(), W, P)
    assert.equal(snap.signals.backlogReadyForPlanningCount, 1)
  })

  it("stakeholder readonly projection", async () => {
    const sprintRepo = new MemSprintRepo([sprintFixture("active")])
    const svc = buildService(sprintRepo)
    const stakeholder: WorkspaceMemberState = {
      ...smActor(),
      workspaceRoleMethodological: null,
      workspaceRoleAdministrative: "auditor",
    }
    const snap = await svc.getOperatingSnapshot(stakeholder, W, P)
    assert.equal(snap.roleProjection.hubLayoutVariant, "stakeholder_readonly")
    assert.equal(snap.nextBestAction, null)
  })
})
