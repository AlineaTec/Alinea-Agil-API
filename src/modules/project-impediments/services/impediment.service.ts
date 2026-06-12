import { randomUUID } from "node:crypto"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ImpedimentAuditAction } from "../domain/impediment-audit-action.js"
import type { ImpedimentSeverity, ImpedimentState, ImpedimentStatus } from "../domain/impediment.js"
import { ImpedimentNotFoundError, ImpedimentValidationError } from "../domain/impediment.errors.js"
import {
  assertCanReopen,
  assertCanResolveOrDismiss,
  assertValidActiveToActiveTransition,
  isActiveStatus,
} from "../domain/impediment-transition.policy.js"
import type { ImpedimentAuditRepository } from "../persistence/impediment-audit.repository.js"
import type { ImpedimentListFilters, ImpedimentRepository } from "../persistence/impediment.repository.js"
import {
  assertCanMutateProjectImpediments,
  assertCanReadProjectImpediments,
} from "../policies/impediment-authorization.policy.js"

const TITLE_MAX = 200
const DESCRIPTION_MAX = 8000
const RESOLUTION_SUMMARY_MAX = 4000
const DISMISSAL_REASON_MAX = 4000

export type CreateImpedimentInput = {
  title: string
  description: string
  severity: ImpedimentSeverity
  responsibleUserPublicId?: string | null
  relatedWorkItemPublicId?: string | null
  relatedSprintPublicId?: string | null
  detectedAt?: string | null
}

export type PatchImpedimentInput = {
  title?: string
  description?: string
  severity?: ImpedimentSeverity
  responsibleUserPublicId?: string | null
  relatedWorkItemPublicId?: string | null
  relatedSprintPublicId?: string | null
  detectedAt?: string
  status?: ImpedimentStatus
}

function assertNonEmptyAfterTrim(label: string, value: string, max: number): string {
  const t = value.trim().slice(0, max)
  if (t.length === 0) {
    throw new ImpedimentValidationError(`${label} cannot be empty.`)
  }
  return t
}

function parseIsoDate(label: string, iso: string): Date {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    throw new ImpedimentValidationError(`${label} must be a valid ISO-8601 date.`)
  }
  return d
}

function assertNotFutureDetectedAt(d: Date, now: Date): void {
  if (d.getTime() > now.getTime()) {
    throw new ImpedimentValidationError("detectedAt cannot be in the future.")
  }
}

function snapshotForAudit(s: ImpedimentState): Record<string, unknown> {
  return {
    title: s.title,
    description: s.description,
    status: s.status,
    severity: s.severity,
    responsibleUserPublicId: s.responsibleUserPublicId,
    relatedWorkItemPublicId: s.relatedWorkItemPublicId,
    relatedSprintPublicId: s.relatedSprintPublicId,
    detectedAt: s.detectedAt.toISOString(),
    resolvedAt: s.resolvedAt ? s.resolvedAt.toISOString() : null,
    dismissedAt: s.dismissedAt ? s.dismissedAt.toISOString() : null,
    resolutionSummary: s.resolutionSummary,
    dismissalReason: s.dismissalReason,
  }
}

export class ImpedimentService {
  constructor(
    private readonly impediments: ImpedimentRepository,
    private readonly audit: ImpedimentAuditRepository,
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly backlog: ScrumBacklogRepository,
    private readonly sprintPlanning: ScrumSprintPlanningRepository,
    private readonly workspaceUsers: WorkspaceUserService,
  ) {}

  private async requireWorkspaceRuntimeProject(workspacePublicId: string, projectPublicId: string) {
    return this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
  }

  private async assertAssignableWorkspaceMember(
    workspacePublicId: string,
    userPublicId: string,
  ): Promise<void> {
    const m = await this.workspaceUsers.findActorMember(workspacePublicId, userPublicId)
    if (!m) {
      throw new ImpedimentValidationError("responsibleUserPublicId is not a member of this workspace.")
    }
    if (m.status !== "active" && m.status !== "active_without_seat") {
      throw new ImpedimentValidationError("responsibleUserPublicId must be an active workspace member.")
    }
  }

  private async validateRelatedWorkItem(
    workspacePublicId: string,
    projectPublicId: string,
    relatedWorkItemPublicId: string,
  ): Promise<void> {
    const item = await this.backlog.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      relatedWorkItemPublicId,
    )
    if (!item) {
      throw new ImpedimentValidationError("relatedWorkItemPublicId does not exist in this project.")
    }
  }

  private async validateRelatedSprint(
    workspacePublicId: string,
    projectPublicId: string,
    operationalApproach: "scrum" | "kanban",
    relatedSprintPublicId: string,
  ): Promise<void> {
    if (operationalApproach !== "scrum") {
      throw new ImpedimentValidationError("relatedSprintPublicId is only valid for Scrum operational projects.")
    }
    const sp = await this.sprintPlanning.findSprintByPublicId(
      workspacePublicId,
      projectPublicId,
      relatedSprintPublicId,
    )
    if (!sp) {
      throw new ImpedimentValidationError("relatedSprintPublicId does not exist in this project.")
    }
  }

  private async appendAudit(
    actorUserPublicId: string,
    action: ImpedimentAuditAction,
    before: ImpedimentState | null,
    after: ImpedimentState,
  ): Promise<void> {
    await this.audit.append({
      impedimentPublicId: after.impedimentPublicId,
      workspacePublicId: after.workspacePublicId,
      projectPublicId: after.projectPublicId,
      action,
      actorUserPublicId,
      occurredAt: new Date(),
      payloadBefore: before ? snapshotForAudit(before) : null,
      payloadAfter: snapshotForAudit(after),
    })
  }

  async listImpediments(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    filters: ImpedimentListFilters,
    pagination: { limit: number; offset: number },
  ) {
    assertCanReadProjectImpediments(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    return this.impediments.listByProject(workspacePublicId, projectPublicId, filters, pagination)
  }

  async listWorkItemOptions(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    options: {
      q?: string
      limit: number
      sprintPublicId?: string
      includeWorkItemPublicId?: string
    },
  ): Promise<
    Array<{
      workItemPublicId: string
      title: string
      itemType: string
      status: string
    }>
  > {
    assertCanReadProjectImpediments(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const safeLimit = Math.min(50, Math.max(1, Math.floor(options.limit)))
    const q = options.q?.trim()

    let backlogItemPublicIds: string[] | undefined
    if (project.operationalApproach === "scrum" && options.sprintPublicId) {
      const memberships = await this.sprintPlanning.listMembershipsBySprintOrdered(
        workspacePublicId,
        projectPublicId,
        options.sprintPublicId,
      )
      backlogItemPublicIds = memberships.map((m) => m.backlogItemPublicId)
      if (backlogItemPublicIds.length === 0) return []
    }

    let rows = await this.backlog.searchWorkItemOptions(workspacePublicId, projectPublicId, {
      q: q && q.length >= 2 ? q : undefined,
      limit: safeLimit,
      backlogItemPublicIds,
      kanbanBacklogOnly: project.operationalApproach === "kanban",
    })

    const includeId = options.includeWorkItemPublicId?.trim()
    if (includeId && !rows.some((r) => r.backlogItemPublicId === includeId)) {
      const extra = await this.backlog.findByProjectAndItemId(
        workspacePublicId,
        projectPublicId,
        includeId,
      )
      if (extra) {
        rows = [
          {
            backlogItemPublicId: extra.backlogItemPublicId,
            itemType: extra.itemType,
            title: extra.title,
            status: extra.status,
          },
          ...rows,
        ].slice(0, safeLimit)
      }
    }

    return rows.map((r) => ({
      workItemPublicId: r.backlogItemPublicId,
      title: r.title,
      itemType: r.itemType,
      status: r.status,
    }))
  }

  async getImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ): Promise<ImpedimentState> {
    assertCanReadProjectImpediments(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const row = await this.impediments.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!row) {
      throw new ImpedimentNotFoundError()
    }
    return row
  }

  async createImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    input: CreateImpedimentInput,
  ): Promise<ImpedimentState> {
    assertCanMutateProjectImpediments(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const now = new Date()

    const title = assertNonEmptyAfterTrim("title", input.title, TITLE_MAX)
    const description = assertNonEmptyAfterTrim("description", input.description, DESCRIPTION_MAX)

    if (input.relatedWorkItemPublicId) {
      await this.validateRelatedWorkItem(
        workspacePublicId,
        projectPublicId,
        input.relatedWorkItemPublicId,
      )
    }

    if (input.relatedSprintPublicId) {
      await this.validateRelatedSprint(
        workspacePublicId,
        projectPublicId,
        project.operationalApproach === "kanban" ? "kanban" : "scrum",
        input.relatedSprintPublicId,
      )
    }

    let responsible: string | null = input.responsibleUserPublicId ?? null
    if (responsible) {
      await this.assertAssignableWorkspaceMember(workspacePublicId, responsible)
    }

    let detectedAt = now
    if (input.detectedAt) {
      detectedAt = parseIsoDate("detectedAt", input.detectedAt)
      assertNotFutureDetectedAt(detectedAt, now)
    }

    const state: ImpedimentState = {
      impedimentPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      relatedWorkItemPublicId: input.relatedWorkItemPublicId ?? null,
      relatedSprintPublicId: input.relatedSprintPublicId ?? null,
      title,
      description,
      status: "open",
      severity: input.severity,
      responsibleUserPublicId: responsible,
      reportedByUserPublicId: actor.userPublicId,
      detectedAt,
      resolvedAt: null,
      dismissedAt: null,
      resolutionSummary: null,
      dismissalReason: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.impediments.insert(state)
    await this.appendAudit(actor.userPublicId, "impediment_created", null, state)
    return state
  }

  async patchImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    input: PatchImpedimentInput,
  ): Promise<ImpedimentState> {
    assertCanMutateProjectImpediments(actor)
    const project = await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const prev = await this.impediments.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!prev) {
      throw new ImpedimentNotFoundError()
    }

    if (!isActiveStatus(prev.status)) {
      throw new ImpedimentValidationError("Impediment is closed; reopen it before editing.")
    }

    const now = new Date()
    let next: ImpedimentState = { ...prev, updatedAt: now }

    if (input.title !== undefined) {
      next.title = assertNonEmptyAfterTrim("title", input.title, TITLE_MAX)
    }
    if (input.description !== undefined) {
      next.description = assertNonEmptyAfterTrim("description", input.description, DESCRIPTION_MAX)
    }
    if (input.severity !== undefined) {
      next.severity = input.severity
    }
    if (input.responsibleUserPublicId !== undefined) {
      const r = input.responsibleUserPublicId
      if (r === null) {
        next.responsibleUserPublicId = null
      } else {
        await this.assertAssignableWorkspaceMember(workspacePublicId, r)
        next.responsibleUserPublicId = r
      }
    }
    if (input.relatedWorkItemPublicId !== undefined) {
      const rw = input.relatedWorkItemPublicId
      if (rw === null) {
        next.relatedWorkItemPublicId = null
      } else {
        await this.validateRelatedWorkItem(workspacePublicId, projectPublicId, rw)
        next.relatedWorkItemPublicId = rw
      }
    }
    if (input.relatedSprintPublicId !== undefined) {
      const rs = input.relatedSprintPublicId
      if (rs === null) {
        next.relatedSprintPublicId = null
      } else {
        await this.validateRelatedSprint(
          workspacePublicId,
          projectPublicId,
          project.operationalApproach === "kanban" ? "kanban" : "scrum",
          rs,
        )
        next.relatedSprintPublicId = rs
      }
    }

    if (input.detectedAt !== undefined) {
      const d = parseIsoDate("detectedAt", input.detectedAt)
      assertNotFutureDetectedAt(d, now)
      next.detectedAt = d
    }

    if (input.status !== undefined) {
      if (input.status === "resolved" || input.status === "dismissed") {
        throw new ImpedimentValidationError("Use POST /resolve, /dismiss to close an impediment.")
      }
      assertValidActiveToActiveTransition(prev.status, input.status)
      next.status = input.status
    }

    if (isActiveStatus(next.status)) {
      next.resolvedAt = null
      next.dismissedAt = null
      next.resolutionSummary = null
      next.dismissalReason = null
    }

    await this.impediments.replace(next)

    let action: ImpedimentAuditAction = "impediment_updated"
    if (input.detectedAt !== undefined && prev.detectedAt.getTime() !== next.detectedAt.getTime()) {
      action = "impediment_detected_at_changed"
    } else if (input.status !== undefined && prev.status !== next.status) {
      action = "impediment_status_changed"
    } else if (input.severity !== undefined && prev.severity !== next.severity) {
      action = "impediment_severity_changed"
    } else if (
      input.responsibleUserPublicId !== undefined &&
      prev.responsibleUserPublicId !== next.responsibleUserPublicId
    ) {
      action = "impediment_assignee_changed"
    }

    await this.appendAudit(actor.userPublicId, action, prev, next)
    return next
  }

  async resolveImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    resolutionSummary: string,
  ): Promise<ImpedimentState> {
    assertCanMutateProjectImpediments(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const prev = await this.impediments.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!prev) {
      throw new ImpedimentNotFoundError()
    }
    assertCanResolveOrDismiss(prev.status)

    const summary = assertNonEmptyAfterTrim("resolutionSummary", resolutionSummary, RESOLUTION_SUMMARY_MAX)
    const now = new Date()
    const next: ImpedimentState = {
      ...prev,
      status: "resolved",
      resolutionSummary: summary,
      dismissalReason: null,
      resolvedAt: now,
      dismissedAt: null,
      updatedAt: now,
    }

    await this.impediments.replace(next)
    await this.appendAudit(actor.userPublicId, "impediment_resolved", prev, next)
    return next
  }

  async dismissImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    dismissalReason: string,
  ): Promise<ImpedimentState> {
    assertCanMutateProjectImpediments(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const prev = await this.impediments.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!prev) {
      throw new ImpedimentNotFoundError()
    }
    assertCanResolveOrDismiss(prev.status)

    const reason = assertNonEmptyAfterTrim("dismissalReason", dismissalReason, DISMISSAL_REASON_MAX)
    const now = new Date()
    const next: ImpedimentState = {
      ...prev,
      status: "dismissed",
      dismissalReason: reason,
      resolutionSummary: null,
      dismissedAt: now,
      resolvedAt: null,
      updatedAt: now,
    }

    await this.impediments.replace(next)
    await this.appendAudit(actor.userPublicId, "impediment_dismissed", prev, next)
    return next
  }

  async reopenImpediment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ): Promise<ImpedimentState> {
    assertCanMutateProjectImpediments(actor)
    await this.requireWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const prev = await this.impediments.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!prev) {
      throw new ImpedimentNotFoundError()
    }
    assertCanReopen(prev.status)

    const now = new Date()
    const next: ImpedimentState = {
      ...prev,
      status: "open",
      resolutionSummary: null,
      dismissalReason: null,
      resolvedAt: null,
      dismissedAt: null,
      updatedAt: now,
    }

    await this.impediments.replace(next)
    await this.appendAudit(actor.userPublicId, "impediment_reopened", prev, next)
    return next
  }
}
