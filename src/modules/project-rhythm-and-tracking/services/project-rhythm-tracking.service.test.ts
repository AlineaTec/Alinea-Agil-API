import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { KanbanWipConfigService } from "../../project-kanban-wip-limits/services/kanban-wip-config.service.js"
import type { KanbanMetricsService } from "../../project-kanban-metrics/services/kanban-metrics.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumSprintState } from "../../project-scrum-sprint-planning/domain/scrum-sprint.js"
import type {
  ProjectVelocityResponse,
  SprintBurndownResponse,
} from "../../project-scrum-burndown-velocity/services/scrum-burndown-velocity.service.js"
import type { ScrumBurndownVelocityService } from "../../project-scrum-burndown-velocity/services/scrum-burndown-velocity.service.js"
import type { ImpedimentService } from "../../project-impediments/services/impediment.service.js"
import type { FlowTimeResponseDto } from "../../project-cycle-lead-time/services/flow-time.service.js"
import type { FlowTimeService } from "../../project-cycle-lead-time/services/flow-time.service.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { ProjectRhythmTrackingService } from "./project-rhythm-tracking.service.js"
import { assertCanReadProjectRhythmTracking } from "../policies/project-rhythm-tracking-authorization.policy.js"

const WS = "a1000000-0000-4000-8000-000000000001"
const PROJ = "a2000000-0000-4000-8000-000000000002"
const SPRINT = "a3000000-0000-4000-8000-000000000003"
const U1 = "b1000000-0000-4000-8000-0000000000aa"

function scrumActor(): WorkspaceMemberState {
  return minimalWorkspaceMember({
    workspacePublicId: WS,
    workspaceRoleMethodological: "scrum_developer",
  })
}

function kanbanActor(): WorkspaceMemberState {
  return minimalWorkspaceMember({
    workspacePublicId: WS,
    workspaceRoleMethodological: "scrum_developer",
  })
}

function velocityN(n: number): ProjectVelocityResponse {
  const sprints = Array.from({ length: n }, (_, i) => ({
    sprintPublicId: `sp-${i}`,
    name: `S${i}`,
    closedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    completedStoryPoints: 5,
    committedStoryPoints: 8,
    dataQualityWarnings: [] as string[],
  }))
  return {
    projectPublicId: PROJ,
    workspacePublicId: WS,
    unit: "story_points",
    calculationVersion: "v-test",
    lastN: 6,
    sprints,
    averageVelocityLastN: n >= 2 ? 5 : n === 1 ? 5 : null,
    hasSufficientData: n > 0,
    dataQualityWarnings: [],
    calculationNotes: [],
  }
}

function burndownOk(): SprintBurndownResponse {
  return {
    sprintPublicId: SPRINT,
    projectPublicId: PROJ,
    workspacePublicId: WS,
    unit: "story_points",
    calculationVersion: "v-test",
    initialCommittedPoints: 20,
    completedPointsAsOfLastDay: 4,
    scopeChangeDetected: false,
    days: [
      {
        date: "2026-01-01",
        remainingPoints: 16,
        idealRemainingPoints: 15,
        cumulativeFlow: {
          toDoPoints: 10,
          inProgressPoints: 4,
          inReviewPoints: 2,
          donePoints: 4,
        },
      },
    ],
    hasSufficientData: true,
    dataQualityWarnings: [],
    calculationNotes: [],
  }
}

const activeSprint: ScrumSprintState = {
  sprintPublicId: SPRINT,
  workspacePublicId: WS,
  projectPublicId: PROJ,
  name: "Active",
  goal: "g",
  status: "active",
  startDate: new Date(Date.UTC(2026, 0, 1)),
  endDate: new Date(Date.UTC(2026, 0, 14)),
  createdByUserPublicId: U1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  closure: null,
  review: null,
  retrospective: null,
}

function operational(approach: WorkspaceRuntimeProjectState["operationalApproach"]): WorkspaceRuntimeProjectState {
  const now = new Date()
  return {
    projectPublicId: PROJ,
    workspacePublicId: WS,
    sourceDraftPublicId: "draft-1",
    projectName: "P",
    operationalApproach: approach,
    initialConfigurationSummary: defaultInitialConfigurationSummary(approach),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function flowTimeDto(n: number, cycleUnavailable = false): FlowTimeResponseDto {
  return {
    operationalApproach: "kanban",
    period: { from: new Date(0).toISOString(), to: new Date(1).toISOString(), timeZone: "UTC" },
    definitions: {
      leadTimeStartedAt: "flow_entry",
      cycleTimeStartedAt: "execution_start",
      endedAt: "terminal_done_column",
    },
    hasSufficientData: n >= 5,
    sample: {
      completedItemsCount: n,
      lowSample: n < 5,
      lowSampleThreshold: 5,
    },
    leadTime: { unit: "days", meanDays: n > 0 ? 3.2 : null },
    cycleTime: { unit: "days", meanDays: cycleUnavailable ? null : n > 0 ? 1.5 : null, unavailable: cycleUnavailable },
    dataQualityWarnings: [],
    calculationNotes: [],
    items: null,
  }
}

describe("project-rhythm-tracking.service", () => {
  it("Scrum + sprint activo + burndown suficiente → primary burndown", async () => {
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> = {
      listSprintsByProject: async () => [activeSprint],
    }
    const burndownSvc: Pick<ScrumBurndownVelocityService, "getSprintBurndown" | "getProjectVelocity"> = {
      getSprintBurndown: async () => burndownOk(),
      getProjectVelocity: async () => velocityN(3),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("scrum"),
      } as unknown as ProjectRuntimeService,
      sprintRepo as ScrumSprintPlanningRepository,
      burndownSvc as unknown as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(scrumActor(), WS, PROJ)
    assert.equal(body.primaryVisual.kind, "burndown")
    assert.equal(body.primaryVisual.displayMode, "chart")
    assert.equal(body.flags.burndownUnavailable, undefined)
  })

  it("Scrum sin sprint activo → primary committed_completed", async () => {
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> = {
      listSprintsByProject: async () => [],
    }
    const burndownSvc: Pick<ScrumBurndownVelocityService, "getSprintBurndown" | "getProjectVelocity"> = {
      getSprintBurndown: async () => {
        throw new Error("should not call burndown")
      },
      getProjectVelocity: async () => velocityN(2),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("scrum"),
      } as unknown as ProjectRuntimeService,
      sprintRepo as ScrumSprintPlanningRepository,
      burndownSvc as unknown as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(scrumActor(), WS, PROJ)
    assert.equal(body.primaryVisual.kind, "committed_completed")
    const vel = body.secondaryVisuals.find((v) => v.kind === "velocity")!
    assert.equal(vel.displayMode, "text")
    assert.equal(body.flags.insufficientSprintHistory, true)
  })

  it("Velocity secondary: chart solo con ≥ 3 sprints cerrados", async () => {
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> = {
      listSprintsByProject: async () => [],
    }
    const burndownSvc: Pick<ScrumBurndownVelocityService, "getProjectVelocity"> = {
      getProjectVelocity: async () => velocityN(3),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("scrum"),
      } as unknown as ProjectRuntimeService,
      sprintRepo as ScrumSprintPlanningRepository,
      burndownSvc as unknown as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(scrumActor(), WS, PROJ)
    const vel = body.secondaryVisuals.find((v) => v.kind === "velocity")!
    assert.equal(vel.displayMode, "chart")
    assert.equal((vel.payload as { chartEligible: boolean }).chartEligible, true)
  })

  it("Kanban: primary lead_time; chart si hasSufficientData (≥5 ítems)", async () => {
    const flowTime: Pick<FlowTimeService, "getFlowTime"> = {
      getFlowTime: async () => flowTimeDto(6),
    }
    const metrics: Pick<KanbanMetricsService, "getThroughput"> = {
      getThroughput: async () => ({
        from: new Date(0).toISOString(),
        to: new Date(1).toISOString(),
        terminalColumnPublicId: "term",
        weeks: [{ weekStart: "2026-01-05", completedItemsCount: 2 }],
        leadTimeFromFlowEntry: {
          basedOnAudit: true,
          sampleCount: 4,
          medianDays: 3,
          notes: "",
        },
      }),
    }
    const wip: Pick<KanbanWipConfigService, "getWip"> = {
      getWip: async () => ({
        wip_near_threshold_ratio: 0.8,
        flow_updated_at: new Date(0).toISOString(),
        columns: [
          {
            column_public_id: "c1",
            name: "Doing",
            position: 1,
            limit: 3,
            policy: "warning" as const,
            current_count: 3,
            ratio: 1,
            state: "at_limit",
            near_threshold_ratio: 0.8,
            can_proceed_move_in: true,
            requires_confirmation_for_next_add: false,
            requires_override_for_next_add: false,
          },
        ],
      }),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("kanban"),
      } as unknown as ProjectRuntimeService,
      {} as ScrumSprintPlanningRepository,
      {} as ScrumBurndownVelocityService,
      flowTime as unknown as FlowTimeService,
      metrics as unknown as KanbanMetricsService,
      wip as unknown as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(kanbanActor(), WS, PROJ)
    assert.equal(body.primaryVisual.kind, "lead_time")
    assert.equal(body.primaryVisual.displayMode, "chart")
    const cycle = body.secondaryVisuals.find((s) => s.kind === "cycle_time")!
    assert.equal(cycle.kind, "cycle_time")
    assert(body.signals.wip)
    assert.equal(body.signals.wip!.columnsAtRiskCount >= 1, true)
    assert.equal(body.flags.agingNotAvailableInV1, true)
  })

  it("Kanban: <5 ítems → primary lead en texto/degradado, flag insufficientCompletedItems", async () => {
    const flowTime: Pick<FlowTimeService, "getFlowTime"> = {
      getFlowTime: async () => flowTimeDto(2),
    }
    const metrics: Pick<KanbanMetricsService, "getThroughput"> = {
      getThroughput: async () => ({
        from: "",
        to: "",
        terminalColumnPublicId: "t",
        weeks: [],
        leadTimeFromFlowEntry: { basedOnAudit: true, sampleCount: 0, medianDays: null, notes: "" },
      }),
    }
    const wip: Pick<KanbanWipConfigService, "getWip"> = {
      getWip: async () => ({
        wip_near_threshold_ratio: 0.8,
        flow_updated_at: new Date(0).toISOString(),
        columns: [],
      }),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("kanban"),
      } as unknown as ProjectRuntimeService,
      {} as ScrumSprintPlanningRepository,
      {} as ScrumBurndownVelocityService,
      flowTime as unknown as FlowTimeService,
      metrics as unknown as KanbanMetricsService,
      wip as unknown as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(kanbanActor(), WS, PROJ)
    assert.equal(body.primaryVisual.displayMode, "text")
    assert.equal(body.flags.insufficientCompletedItems, true)
  })

  it("Scrum + sprint activo + burndown sin datos suficientes → fallback committed_completed", async () => {
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> = {
      listSprintsByProject: async () => [activeSprint],
    }
    const badBurndown: SprintBurndownResponse = {
      ...burndownOk(),
      hasSufficientData: false,
    }
    const burndownSvc: Pick<ScrumBurndownVelocityService, "getSprintBurndown" | "getProjectVelocity"> = {
      getSprintBurndown: async () => badBurndown,
      getProjectVelocity: async () => velocityN(1),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("scrum"),
      } as unknown as ProjectRuntimeService,
      sprintRepo as ScrumSprintPlanningRepository,
      burndownSvc as unknown as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(scrumActor(), WS, PROJ)
    assert.equal(body.primaryVisual.kind, "committed_completed")
    assert.equal(body.flags.burndownUnavailable, true)
  })

  it("Kanban: options.auditLogAvailable false → throughput degradado sin llamar a getThroughput", async () => {
    const flowTime: Pick<FlowTimeService, "getFlowTime"> = {
      getFlowTime: async () => flowTimeDto(6),
    }
    let throughputCalled = false
    const metrics: Pick<KanbanMetricsService, "getThroughput"> = {
      getThroughput: async () => {
        throughputCalled = true
        throw new Error("getThroughput should not run when auditLogAvailable is false")
      },
    }
    const wip: Pick<KanbanWipConfigService, "getWip"> = {
      getWip: async () => ({
        wip_near_threshold_ratio: 0.8,
        flow_updated_at: new Date(0).toISOString(),
        columns: [],
      }),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("kanban"),
      } as unknown as ProjectRuntimeService,
      {} as ScrumSprintPlanningRepository,
      {} as ScrumBurndownVelocityService,
      flowTime as unknown as FlowTimeService,
      metrics as unknown as KanbanMetricsService,
      wip as unknown as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: false },
    )
    const body = await svc.getRhythmTracking(kanbanActor(), WS, PROJ)
    assert.equal(throughputCalled, false)
    const thr = body.secondaryVisuals.find((s) => s.kind === "throughput")!
    assert.equal(thr.displayMode, "degraded")
    assert.equal(body.flags.throughputUnavailable, true)
  })

  it("Kanban: throughputUnavailable cuando leadTimeFromFlowEntry no está basado en auditoría", async () => {
    const flowTime: Pick<FlowTimeService, "getFlowTime"> = {
      getFlowTime: async () => flowTimeDto(6),
    }
    const metrics: Pick<KanbanMetricsService, "getThroughput"> = {
      getThroughput: async () => ({
        from: new Date(0).toISOString(),
        to: new Date(1).toISOString(),
        terminalColumnPublicId: "term",
        weeks: [{ weekStart: "2026-01-05", completedItemsCount: 1 }],
        leadTimeFromFlowEntry: {
          basedOnAudit: false,
          sampleCount: 0,
          medianDays: null,
          notes: "Auditoría no configurada; lead time no calculado.",
        },
      }),
    }
    const wip: Pick<KanbanWipConfigService, "getWip"> = {
      getWip: async () => ({
        wip_near_threshold_ratio: 0.8,
        flow_updated_at: new Date(0).toISOString(),
        columns: [],
      }),
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("kanban"),
      } as unknown as ProjectRuntimeService,
      {} as ScrumSprintPlanningRepository,
      {} as ScrumBurndownVelocityService,
      flowTime as unknown as FlowTimeService,
      metrics as unknown as KanbanMetricsService,
      wip as unknown as KanbanWipConfigService,
      {
        listImpediments: async () => ({ items: [], totalCount: 0 }),
      } as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    const body = await svc.getRhythmTracking(kanbanActor(), WS, PROJ)
    const thr = body.secondaryVisuals.find((s) => s.kind === "throughput")!
    assert.equal(thr.displayMode, "degraded")
    assert.equal(body.flags.throughputUnavailable, true)
  })

  it("predictive_phases → text_only primary sin secundarias", async () => {
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("predictive_phases"),
      } as unknown as ProjectRuntimeService,
      {} as ScrumSprintPlanningRepository,
      {} as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      {} as ImpedimentService,
      { auditLogAvailable: false },
    )
    const body = await svc.getRhythmTracking(
      minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" }),
      WS,
      PROJ,
    )
    assert.equal(body.primaryVisual.kind, "text_only")
    assert.equal(body.secondaryVisuals.length, 0)
  })

  it("impedimentos: resumen con filtro sprint cuando hay sprint activo", async () => {
    const sprintRepo: Pick<ScrumSprintPlanningRepository, "listSprintsByProject"> = {
      listSprintsByProject: async () => [activeSprint],
    }
    const burndownSvc: Pick<ScrumBurndownVelocityService, "getSprintBurndown" | "getProjectVelocity"> = {
      getSprintBurndown: async () => burndownOk(),
      getProjectVelocity: async () => velocityN(0),
    }
    let capturedFilter: { relatedSprintPublicId?: string } | null = null
    const imped: Pick<ImpedimentService, "listImpediments"> = {
      listImpediments: async (_a, _w, _p, filters) => {
        capturedFilter = filters
        return { items: [], totalCount: 0 }
      },
    }
    const svc = new ProjectRhythmTrackingService(
      {
        findWorkspaceRuntimeProjectState: async () => operational("scrum"),
      } as unknown as ProjectRuntimeService,
      sprintRepo as ScrumSprintPlanningRepository,
      burndownSvc as unknown as ScrumBurndownVelocityService,
      {} as FlowTimeService,
      {} as KanbanMetricsService,
      {} as KanbanWipConfigService,
      imped as unknown as ImpedimentService,
      { auditLogAvailable: true },
    )
    await svc.getRhythmTracking(scrumActor(), WS, PROJ)
    assert.equal(capturedFilter?.relatedSprintPublicId, SPRINT)
  })
})

describe("project-rhythm-tracking-authorization.policy", () => {
  it("permite developer Scrum (tablero) sin admin runtime", () => {
    assert.doesNotThrow(() =>
      assertCanReadProjectRhythmTracking(
        minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" }),
      ),
    )
  })

  it("rechaza miembro sin rol de lectura relevante", () => {
    assert.throws(() => assertCanReadProjectRhythmTracking(minimalWorkspaceMember()))
  })
})
