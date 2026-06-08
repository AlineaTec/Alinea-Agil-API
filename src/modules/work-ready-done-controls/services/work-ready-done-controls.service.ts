import { randomUUID } from "node:crypto"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { ProjectKanbanFlowConfigState } from "../../project-kanban-core/domain/kanban-flow.js"
import type { ImpedimentRepository } from "../../project-impediments/persistence/impediment.repository.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import {
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { buildDefaultV1Criteria } from "../domain/work-ready-done-build-default-criteria.js"
import type { WorkControlEventCode } from "../domain/work-ready-done-controls.constants.js"
import {
  WorkControlsBlockedError,
  WorkControlsNotFoundError,
  WorkControlsValidationError,
} from "../domain/work-ready-done-controls.errors.js"
import type {
  WorkControlCriterionConfig,
  WorkControlsEvaluationResult,
  WorkControlsProjectProfileState,
  WorkControlsTemplateState,
} from "../domain/work-ready-done-controls.dto.js"
import { evaluateWorkControls } from "../domain/work-ready-done-criteria.evaluator.js"
import type { WorkControlOverrideTokenRepository } from "../persistence/work-control-override-token.repository.js"
import type {
  WorkControlsAuditDetails,
  WorkControlsAuditEventName,
  WorkControlsAuditRepository,
} from "../persistence/work-controls-audit.repository.js"
import type { WorkControlsProjectProfileRepository } from "../persistence/work-controls-project-profile.repository.js"
import type { WorkControlsWorkspaceTemplateRepository } from "../persistence/work-controls-workspace-template.repository.js"

const OVERRIDE_TTL_MS = 3 * 60 * 1000

const OPEN_IMPEDIMENT_STATUSES = ["open", "in_review", "mitigating"] as const

export type WorkReadyDoneControlsPersistence = {
  projectProfiles: WorkControlsProjectProfileRepository
  workspaceTemplates: WorkControlsWorkspaceTemplateRepository
  overrideTokens: WorkControlOverrideTokenRepository
  workControlsAudit: WorkControlsAuditRepository
}

function mergeCriteria(base: WorkControlCriterionConfig[], patch: WorkControlCriterionConfig[]): WorkControlCriterionConfig[] {
  const m = new Map(base.map((c) => [c.ruleId, c]))
  for (const p of patch) m.set(p.ruleId, p)
  return [...m.values()]
}

export type WorkReadyDoneTransitionPort = {
  assertMayCloseScrumItemToDone: (input: {
    workspacePublicId: string
    projectPublicId: string
    current: ScrumBacklogItemState
    actor: WorkspaceMemberState
    overrideToken: string | null
  }) => Promise<void>
  assertMayMoveKanbanToColumn: (input: {
    workspacePublicId: string
    projectPublicId: string
    flow: ProjectKanbanFlowConfigState
    item: ScrumBacklogItemState
    toColumnPublicId: string
    actor: WorkspaceMemberState
    overrideToken: string | null
  }) => Promise<void>
  assertMayReleaseKanbanToFlow: (input: {
    workspacePublicId: string
    projectPublicId: string
    item: ScrumBacklogItemState
    entryColumnPublicId: string
    actor: WorkspaceMemberState
    overrideToken: string | null
  }) => Promise<void>
}

export class WorkReadyDoneControlsService {
  private readonly projectProfiles: WorkControlsProjectProfileRepository
  private readonly workspaceTemplates: WorkControlsWorkspaceTemplateRepository
  private readonly overrideTokens: WorkControlOverrideTokenRepository
  private readonly workControlsAudit: WorkControlsAuditRepository

  constructor(
    private readonly projectRuntime: ProjectRuntimeService,
    private readonly backlog: ScrumBacklogRepository,
    private readonly impediments: ImpedimentRepository,
    persistence: WorkReadyDoneControlsPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.projectProfiles = persistence.projectProfiles
    this.workspaceTemplates = persistence.workspaceTemplates
    this.overrideTokens = persistence.overrideTokens
    this.workControlsAudit = persistence.workControlsAudit
  }

  private async loadImpedimentsForItem(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
  ) {
    const { items } = await this.impediments.listByProject(
      workspacePublicId,
      projectPublicId,
      {
        relatedWorkItemPublicId: workItemPublicId,
        status: [...OPEN_IMPEDIMENT_STATUSES],
        severity: "critical",
      },
      { limit: 50, offset: 0 },
    )
    return items
  }

  private async readProfile(
    workspacePublicId: string,
    projectPublicId: string,
    approach: "scrum" | "kanban",
  ): Promise<WorkControlsProjectProfileState | null> {
    return this.projectProfiles.findOne(workspacePublicId, projectPublicId, approach)
  }

  /**
   * Perfil persistido o default en memoria (OQ-11); no persiste hasta PATCH explícito.
   */
  async getProjectProfile(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<{ profile: WorkControlsProjectProfileState; persisted: boolean }> {
    let row
    try {
      row = await this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    } catch (e) {
      if (e instanceof ProjectRuntimeNotFoundError) {
        throw new WorkControlsNotFoundError("Operational project not found.")
      }
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new WorkControlsValidationError("Work controls v1 only apply to scrum or kanban projects.")
      }
      throw e
    }
    const approachRaw = row.operationalApproach
    if (approachRaw !== "scrum" && approachRaw !== "kanban") {
      throw new WorkControlsValidationError("Work controls v1 only apply to scrum or kanban projects.")
    }
    const approach = approachRaw
    const profile = await this.readProfile(workspacePublicId, projectPublicId, approach)
    if (profile) return { profile, persisted: true }
    const t = this.now()
    return {
      profile: {
        workspacePublicId,
        projectPublicId,
        approach,
        version: 1,
        definitionSource: "system_default",
        criteria: buildDefaultV1Criteria(),
        kanbanColumnMapping: {
          startExecutionColumnPublicId: null,
          doneCloseItemColumnPublicId: null,
        },
        createdAt: t,
        updatedAt: t,
      },
      persisted: false,
    }
  }

  /**
   * Evaluación on-demand; no muta.
   */
  async evaluate(
    workspacePublicId: string,
    projectPublicId: string,
    workItemPublicId: string,
    eventCode: WorkControlEventCode,
  ): Promise<WorkControlsEvaluationResult> {
    const { profile, persisted: _p } = await this.getProjectProfile(workspacePublicId, projectPublicId)
    if (eventCode === "ready_add_to_sprint" && profile.approach !== "scrum") {
      throw new WorkControlsValidationError("ready_add_to_sprint applies only to scrum projects.")
    }
    const item = await this.backlog.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    if (!item) throw new WorkControlsNotFoundError("Backlog item not found.")
    const impedimentRows = await this.loadImpedimentsForItem(
      workspacePublicId,
      projectPublicId,
      workItemPublicId,
    )
    return evaluateWorkControls(
      eventCode,
      item,
      profile.approach,
      profile.criteria,
      impedimentRows,
    )
  }

  private workControlMessage(eventCode: WorkControlEventCode): string {
    switch (eventCode) {
      case "ready_add_to_sprint":
        return "Work item does not satisfy Definition of Ready for sprint commitment (work controls)."
      case "ready_start_execution":
        return "Work item does not satisfy Definition of Ready to start work (work controls)."
      case "done_close_item":
        return "Work item does not satisfy Definition of Done (work controls)."
      default: {
        const _e: never = eventCode
        return _e
      }
    }
  }

  /**
   * Camino único a bloqueo/override/auditoría de transición denegada.
   */
  private async assertWorkControlEvent(
    input: {
      workspacePublicId: string
      projectPublicId: string
      workItemPublicId: string
      eventCode: WorkControlEventCode
      actor: WorkspaceMemberState
      overrideToken: string | null
    },
  ): Promise<void> {
    const { workspacePublicId, projectPublicId, workItemPublicId, eventCode, actor, overrideToken } = input
    const result = await this.evaluate(workspacePublicId, projectPublicId, workItemPublicId, eventCode)
    if (result.canContinue) return
    if (result.canResolveWithOverride && overrideToken) {
      const ok = await this.validateAndConsumeOverride({
        overrideToken,
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
        eventCode,
        actor,
      })
      if (ok) return
    }
    await this.appendAudit("transition_blocked", workspacePublicId, projectPublicId, actor.userPublicId, {
      workItemPublicId,
      eventCode,
      failedRuleIds: result.failedBlockingRuleIds,
    })
    throw new WorkControlsBlockedError(this.workControlMessage(eventCode), {
      eventCode,
      workItemPublicId,
      effectiveOutcome: "block",
      failedRuleIds: result.failedBlockingRuleIds,
    })
  }

  async assertMayCloseScrumItemToDone(input: {
    workspacePublicId: string
    projectPublicId: string
    current: ScrumBacklogItemState
    actor: WorkspaceMemberState
    overrideToken: string | null
  }): Promise<void> {
    return this.assertWorkControlEvent({
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      workItemPublicId: input.current.backlogItemPublicId,
      eventCode: "done_close_item",
      actor: input.actor,
      overrideToken: input.overrideToken,
    })
  }

  async assertMayCommitToSprint(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    actor: WorkspaceMemberState
    overrideToken: string | null
  }): Promise<void> {
    return this.assertWorkControlEvent({
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      workItemPublicId: input.workItemPublicId,
      eventCode: "ready_add_to_sprint",
      actor: input.actor,
      overrideToken: input.overrideToken,
    })
  }

  async assertMayTransitionScrumToInProgress(input: {
    workspacePublicId: string
    projectPublicId: string
    current: ScrumBacklogItemState
    actor: WorkspaceMemberState
    overrideToken: string | null
  }): Promise<void> {
    return this.assertWorkControlEvent({
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      workItemPublicId: input.current.backlogItemPublicId,
      eventCode: "ready_start_execution",
      actor: input.actor,
      overrideToken: input.overrideToken,
    })
  }

  /**
   * Mapeo explícito Kanban: al mover a la columna configurada como cierre, o como inicio de ejecución.
   */
  async assertMayMoveKanbanToColumn(input: {
    workspacePublicId: string
    projectPublicId: string
    flow: ProjectKanbanFlowConfigState
    item: ScrumBacklogItemState
    toColumnPublicId: string
    actor: WorkspaceMemberState
    overrideToken: string | null
  }): Promise<void> {
    const { workspacePublicId, projectPublicId, flow: _flow, item, toColumnPublicId, overrideToken, actor } = input
    const { profile } = await this.getProjectProfile(workspacePublicId, projectPublicId)
    if (profile.approach !== "kanban") return
    const { doneCloseItemColumnPublicId, startExecutionColumnPublicId } = profile.kanbanColumnMapping
    if (doneCloseItemColumnPublicId && toColumnPublicId === doneCloseItemColumnPublicId) {
      return this.assertWorkControlEvent({
        workspacePublicId,
        projectPublicId,
        workItemPublicId: item.backlogItemPublicId,
        eventCode: "done_close_item",
        actor,
        overrideToken,
      })
    }
    if (startExecutionColumnPublicId && toColumnPublicId === startExecutionColumnPublicId) {
      return this.assertWorkControlEvent({
        workspacePublicId,
        projectPublicId,
        workItemPublicId: item.backlogItemPublicId,
        eventCode: "ready_start_execution",
        actor,
        overrideToken,
      })
    }
  }

  /**
   * Si la columna de entrada del flujo coincide con el mapeo `startExecutionColumnPublicId`, aplica el mismo
   * evento que al mover a esa columna (sin inferir nombres de columna: solo id explícito y coincidencia).
   */
  async assertMayReleaseKanbanToFlow(input: {
    workspacePublicId: string
    projectPublicId: string
    item: ScrumBacklogItemState
    entryColumnPublicId: string
    actor: WorkspaceMemberState
    overrideToken: string | null
  }): Promise<void> {
    const { workspacePublicId, projectPublicId, item, entryColumnPublicId, actor, overrideToken } = input
    const { profile } = await this.getProjectProfile(workspacePublicId, projectPublicId)
    if (profile.approach !== "kanban") return
    const startId = profile.kanbanColumnMapping.startExecutionColumnPublicId
    if (startId == null || startId === "" || entryColumnPublicId !== startId) return
    return this.assertWorkControlEvent({
      workspacePublicId,
      projectPublicId,
      workItemPublicId: item.backlogItemPublicId,
      eventCode: "ready_start_execution",
      actor,
      overrideToken,
    })
  }

  private async appendAudit(
    e: WorkControlsAuditEventName,
    workspacePublicId: string,
    projectPublicId: string | null,
    actorUserPublicId: string,
    details: WorkControlsAuditDetails,
  ): Promise<void> {
    await this.workControlsAudit.append({
      workspacePublicId,
      projectPublicId,
      event: e,
      actorUserPublicId,
      occurredAt: this.now(),
      details,
    })
  }

  private async validateAndConsumeOverride(p: {
    overrideToken: string
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    eventCode: WorkControlEventCode
    actor: WorkspaceMemberState
  }): Promise<boolean> {
    const row = await this.overrideTokens.findOne(
      p.overrideToken,
      p.workspacePublicId,
      p.projectPublicId,
    )
    if (!row) return false
    if (row.consumedAt != null) return false
    if (row.expiresAt.getTime() < this.now().getTime()) return false
    if (row.workItemPublicId !== p.workItemPublicId) return false
    if (row.eventCode !== p.eventCode) return false
    const consumed = await this.overrideTokens.markConsumed(p.overrideToken, this.now())
    if (!consumed) return false
    await this.appendAudit("override_token_consumed", p.workspacePublicId, p.projectPublicId, p.actor.userPublicId, {
      overrideTokenPublicId: p.overrideToken,
      workItemPublicId: p.workItemPublicId,
      eventCode: p.eventCode,
    })
    return true
  }

  /**
   * Emite un token de override de un solo uso (v1).
   */
  async issueOverrideToken(input: {
    workspacePublicId: string
    projectPublicId: string
    workItemPublicId: string
    eventCode: WorkControlEventCode
    reason: string
    actor: WorkspaceMemberState
  }): Promise<{ overrideTokenPublicId: string; expiresAt: string }> {
    const result = await this.evaluate(
      input.workspacePublicId,
      input.projectPublicId,
      input.workItemPublicId,
      input.eventCode,
    )
    if (!result.canResolveWithOverride) {
      throw new WorkControlsValidationError("Override is only valid when evaluation is blocking and rules require it.")
    }
    const t = this.now()
    const exp = new Date(t.getTime() + OVERRIDE_TTL_MS)
    const id = randomUUID()
    await this.overrideTokens.create({
      overrideTokenPublicId: id,
      workspacePublicId: input.workspacePublicId,
      projectPublicId: input.projectPublicId,
      workItemPublicId: input.workItemPublicId,
      eventCode: input.eventCode,
      actorUserPublicId: input.actor.userPublicId,
      reason: input.reason.trim().slice(0, 4000),
      createdAt: t,
      expiresAt: exp,
      consumedAt: null,
    })
    await this.appendAudit("override_token_issued", input.workspacePublicId, input.projectPublicId, input.actor.userPublicId, {
      workItemPublicId: input.workItemPublicId,
      eventCode: input.eventCode,
      overrideTokenPublicId: id,
      reasonSnippet: input.reason.trim().slice(0, 200),
    })
    return { overrideTokenPublicId: id, expiresAt: exp.toISOString() }
  }

  async patchProjectProfile(
    workspacePublicId: string,
    projectPublicId: string,
    patch: {
      criteria: WorkControlCriterionConfig[]
      kanbanColumnMapping?: { startExecutionColumnPublicId: string | null; doneCloseItemColumnPublicId: string | null }
      definitionSource?: "project" | "workspace_template"
    },
    actorUserPublicId: string,
  ): Promise<WorkControlsProjectProfileState> {
    let row
    try {
      row = await this.projectRuntime.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    } catch (e) {
      if (e instanceof ProjectRuntimeNotFoundError) throw new WorkControlsNotFoundError("Operational project not found.")
      if (e instanceof ProjectRuntimeInvalidInputError) {
        throw new WorkControlsValidationError("Invalid project approach for work controls.")
      }
      throw e
    }
    const approachRaw = row.operationalApproach
    if (approachRaw !== "scrum" && approachRaw !== "kanban") {
      throw new WorkControlsValidationError("Invalid project approach for work controls.")
    }
    const approach = approachRaw
    const t = this.now()
    const existing = await this.readProfile(workspacePublicId, projectPublicId, approach)
    const baseCriteria = existing?.criteria ?? buildDefaultV1Criteria()
    const nextCriteria = mergeCriteria(baseCriteria, patch.criteria)
    const nextMapping = patch.kanbanColumnMapping ?? (existing?.kanbanColumnMapping ?? {
      startExecutionColumnPublicId: null,
      doneCloseItemColumnPublicId: null,
    })
    const state: WorkControlsProjectProfileState = {
      workspacePublicId,
      projectPublicId,
      approach,
      version: 1,
      definitionSource: patch.definitionSource ?? "project",
      criteria: nextCriteria,
      kanbanColumnMapping: {
        startExecutionColumnPublicId: nextMapping.startExecutionColumnPublicId,
        doneCloseItemColumnPublicId: nextMapping.doneCloseItemColumnPublicId,
      },
      createdAt: existing?.createdAt ?? t,
      updatedAt: t,
    }
    await this.projectProfiles.upsert(state)
    await this.appendAudit("project_profile_upserted", workspacePublicId, projectPublicId, actorUserPublicId, {
      workItemPublicId: undefined,
    })
    return state
  }

  async getWorkspaceTemplate(
    workspacePublicId: string,
  ): Promise<{ template: WorkControlsTemplateState; persisted: boolean }> {
    const template = await this.workspaceTemplates.findOne(workspacePublicId)
    if (template) return { template, persisted: true }
    const t = this.now()
    return {
      template: {
        workspacePublicId,
        version: 1,
        criteria: buildDefaultV1Criteria(),
        createdAt: t,
        updatedAt: t,
      },
      persisted: false,
    }
  }

  async patchWorkspaceTemplate(
    workspacePublicId: string,
    criteria: WorkControlCriterionConfig[],
    actorUserPublicId: string,
  ): Promise<WorkControlsTemplateState> {
    const t = this.now()
    const { template: def } = await this.getWorkspaceTemplate(workspacePublicId)
    const merged = mergeCriteria(def.criteria, criteria)
    const state: WorkControlsTemplateState = {
      workspacePublicId,
      version: 1,
      criteria: merged,
      createdAt: def.createdAt,
      updatedAt: t,
    }
    await this.workspaceTemplates.upsert(state)
    await this.appendAudit("workspace_template_upserted", workspacePublicId, null, actorUserPublicId, {})
    return state
  }

  async applyWorkspaceTemplateToProject(
    workspacePublicId: string,
    projectPublicId: string,
    actorUserPublicId: string,
  ): Promise<WorkControlsProjectProfileState> {
    const { template } = await this.getWorkspaceTemplate(workspacePublicId)
    const out = await this.patchProjectProfile(
      workspacePublicId,
      projectPublicId,
      { criteria: template.criteria, definitionSource: "workspace_template" },
      actorUserPublicId,
    )
    await this.appendAudit("template_applied_to_project", workspacePublicId, projectPublicId, actorUserPublicId, {
      workItemPublicId: undefined,
    })
    return out
  }
}
