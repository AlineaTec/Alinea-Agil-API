import assert from "node:assert/strict"
import { describe, it, beforeEach } from "node:test"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { defaultInitialConfigurationSummary } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import { ImpedimentForbiddenError, ImpedimentValidationError } from "../domain/impediment.errors.js"
import type { ImpedimentAuditAppendInput } from "../persistence/impediment-audit.repository.js"
import type { ImpedimentAuditRepository } from "../persistence/impediment-audit.repository.js"
import type {
  ImpedimentListFilters,
  ImpedimentListResult,
  ImpedimentRepository,
} from "../persistence/impediment.repository.js"
import type { ImpedimentState } from "../domain/impediment.js"
import { ImpedimentService } from "./impediment.service.js"

const WS = "10000000-0000-4000-8000-000000000001"
const PROJ = "20000000-0000-4000-8000-000000000002"
const ITEM = "30000000-0000-4000-8000-000000000003"
const SPRINT = "40000000-0000-4000-8000-000000000004"
const ASSIGNEE = "50000000-0000-4000-8000-000000000005"

function scrumProject(): WorkspaceRuntimeProjectState {
  const now = new Date()
  return {
    projectPublicId: PROJ,
    workspacePublicId: WS,
    sourceDraftPublicId: "d-1",
    projectName: "P",
    operationalApproach: "scrum",
    initialConfigurationSummary: defaultInitialConfigurationSummary("scrum"),
    status: "active",
    materializedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

function actor(partial: Partial<WorkspaceMemberState> = {}): WorkspaceMemberState {
  return {
    membershipPublicId: "m-1",
    workspacePublicId: WS,
    userPublicId: "60000000-0000-4000-8000-000000000006",
    emailNormalized: "a@test.dev",
    fullName: "Actor",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: null,
    workspaceRoleMethodological: "scrum_master",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  }
}

class InMemoryImpedimentRepository implements ImpedimentRepository {
  rows: ImpedimentState[] = []

  async insert(state: ImpedimentState): Promise<void> {
    this.rows.push(state)
  }

  async replace(state: ImpedimentState): Promise<void> {
    const i = this.rows.findIndex(
      (r) =>
        r.impedimentPublicId === state.impedimentPublicId &&
        r.workspacePublicId === state.workspacePublicId &&
        r.projectPublicId === state.projectPublicId,
    )
    if (i < 0) throw new Error("replace_missing")
    this.rows[i] = state
  }

  async findByProjectAndId(
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ): Promise<ImpedimentState | null> {
    return (
      this.rows.find(
        (r) =>
          r.workspacePublicId === workspacePublicId &&
          r.projectPublicId === projectPublicId &&
          r.impedimentPublicId === impedimentPublicId,
      ) ?? null
    )
  }

  async listByProject(
    workspacePublicId: string,
    projectPublicId: string,
    filters: ImpedimentListFilters,
    pagination: { limit: number; offset: number },
  ): Promise<ImpedimentListResult> {
    let list = this.rows.filter(
      (r) => r.workspacePublicId === workspacePublicId && r.projectPublicId === projectPublicId,
    )
    if (filters.status !== undefined) {
      const st = filters.status
      if (Array.isArray(st)) {
        list = list.filter((r) => st.includes(r.status))
      } else {
        list = list.filter((r) => r.status === st)
      }
    }
    if (filters.severity !== undefined) {
      list = list.filter((r) => r.severity === filters.severity)
    }
    if (filters.responsibleUserPublicId !== undefined) {
      list = list.filter((r) => r.responsibleUserPublicId === filters.responsibleUserPublicId)
    }
    if (filters.relatedWorkItemPublicId !== undefined) {
      list = list.filter((r) => r.relatedWorkItemPublicId === filters.relatedWorkItemPublicId)
    }
    if (filters.relatedSprintPublicId !== undefined) {
      list = list.filter((r) => r.relatedSprintPublicId === filters.relatedSprintPublicId)
    }
    const totalCount = list.length
    const items = list.slice(pagination.offset, pagination.offset + pagination.limit)
    return { items, totalCount }
  }
}

class InMemoryAuditRepository implements ImpedimentAuditRepository {
  entries: ImpedimentAuditAppendInput[] = []
  async append(input: ImpedimentAuditAppendInput): Promise<void> {
    this.entries.push(input)
  }
}

describe("ImpedimentService", () => {
  let impedimentRepo: InMemoryImpedimentRepository
  let auditRepo: InMemoryAuditRepository
  let backlogRepo: ScrumBacklogRepository
  let sprintRepo: ScrumSprintPlanningRepository
  let workspaceUsers: WorkspaceUserService
  let projectRuntime: ProjectRuntimeService
  let service: ImpedimentService

  beforeEach(() => {
    impedimentRepo = new InMemoryImpedimentRepository()
    auditRepo = new InMemoryAuditRepository()
    backlogRepo = {
      async findByProjectAndItemId(workspacePublicId, projectPublicId, backlogItemPublicId) {
        if (backlogItemPublicId === ITEM && workspacePublicId === WS && projectPublicId === PROJ) {
          return { backlogItemPublicId: ITEM } as import("../../project-scrum-backlog/domain/scrum-backlog-item.js").ScrumBacklogItemState
        }
        return null
      },
    } as unknown as ScrumBacklogRepository
    sprintRepo = {
      async findSprintByPublicId(workspacePublicId, projectPublicId, sprintPublicId) {
        if (sprintPublicId === SPRINT && workspacePublicId === WS && projectPublicId === PROJ) {
          return { sprintPublicId: SPRINT } as import("../../project-scrum-sprint-planning/domain/scrum-sprint.js").ScrumSprintState
        }
        return null
      },
    } as unknown as ScrumSprintPlanningRepository
    workspaceUsers = {
      async findActorMember(workspacePublicId: string, userPublicId: string) {
        if (workspacePublicId !== WS) return null
        if (userPublicId === ASSIGNEE || userPublicId === actor().userPublicId) {
          return actor({ userPublicId })
        }
        return null
      },
    } as unknown as WorkspaceUserService
    projectRuntime = {
      async requireScrumOrKanbanWorkspaceRuntimeProject(ws: string, proj: string) {
        if (ws !== WS || proj !== PROJ) {
          throw new ProjectRuntimeNotFoundError()
        }
        return scrumProject()
      },
    } as unknown as ProjectRuntimeService

    service = new ImpedimentService(
      impedimentRepo,
      auditRepo,
      projectRuntime,
      backlogRepo,
      sprintRepo,
      workspaceUsers,
    )
  })

  it("creates impediment and records audit", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "Block",
      description: "Desc",
      severity: "high",
    })
    assert.equal(created.status, "open")
    assert.equal(created.reportedByUserPublicId, a.userPublicId)
    assert.equal(auditRepo.entries.filter((e) => e.action === "impediment_created").length, 1)
  })

  it("lists by project", async () => {
    const a = actor()
    await service.createImpediment(a, WS, PROJ, {
      title: "A",
      description: "D",
      severity: "low",
    })
    const list = await service.listImpediments(a, WS, PROJ, {}, { limit: 20, offset: 0 })
    assert.equal(list.totalCount, 1)
  })

  it("patches allowed fields", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "low",
    })
    const updated = await service.patchImpediment(a, WS, PROJ, created.impedimentPublicId, {
      title: "T2",
      status: "in_review",
    })
    assert.equal(updated.title, "T2")
    assert.equal(updated.status, "in_review")
  })

  it("resolves with resolutionSummary", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "medium",
    })
    const r = await service.resolveImpediment(a, WS, PROJ, created.impedimentPublicId, "Fixed")
    assert.equal(r.status, "resolved")
    assert.equal(r.resolutionSummary, "Fixed")
    assert.ok(r.resolvedAt)
    assert.equal(r.dismissedAt, null)
  })

  it("dismisses with dismissalReason", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "medium",
    })
    const r = await service.dismissImpediment(a, WS, PROJ, created.impedimentPublicId, "Dup")
    assert.equal(r.status, "dismissed")
    assert.equal(r.dismissalReason, "Dup")
    assert.ok(r.dismissedAt)
    assert.equal(r.resolvedAt, null)
  })

  it("reopens from resolved", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "medium",
    })
    await service.resolveImpediment(a, WS, PROJ, created.impedimentPublicId, "Done")
    const r = await service.reopenImpediment(a, WS, PROJ, created.impedimentPublicId)
    assert.equal(r.status, "open")
    assert.equal(r.resolutionSummary, null)
    assert.ok(auditRepo.entries.some((e) => e.action === "impediment_reopened"))
  })

  it("rejects invalid transition resolve when already resolved", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "medium",
    })
    await service.resolveImpediment(a, WS, PROJ, created.impedimentPublicId, "Done")
    await assert.rejects(
      () => service.resolveImpediment(a, WS, PROJ, created.impedimentPublicId, "Again"),
      ImpedimentValidationError,
    )
  })

  it("audits detectedAt change", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "low",
    })
    const past = new Date(Date.now() - 86_400_000).toISOString()
    await service.patchImpediment(a, WS, PROJ, created.impedimentPublicId, { detectedAt: past })
    assert.ok(auditRepo.entries.some((e) => e.action === "impediment_detected_at_changed"))
  })

  it("rejects patch on closed impediment", async () => {
    const a = actor()
    const created = await service.createImpediment(a, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "low",
    })
    await service.resolveImpediment(a, WS, PROJ, created.impedimentPublicId, "X")
    await assert.rejects(
      () => service.patchImpediment(a, WS, PROJ, created.impedimentPublicId, { title: "Nope" }),
      ImpedimentValidationError,
    )
  })

  it("auditor can read but not mutate", async () => {
    const readActor = actor({ workspaceRoleAdministrative: "auditor", workspaceRoleMethodological: null })
    const mutActor = actor()
    const created = await service.createImpediment(mutActor, WS, PROJ, {
      title: "T",
      description: "D",
      severity: "low",
    })
    const row = await service.getImpediment(readActor, WS, PROJ, created.impedimentPublicId)
    assert.equal(row.impedimentPublicId, created.impedimentPublicId)
    await assert.rejects(
      () => service.patchImpediment(readActor, WS, PROJ, created.impedimentPublicId, { title: "X" }),
      ImpedimentForbiddenError,
    )
  })
})
