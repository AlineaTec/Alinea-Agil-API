import { randomUUID } from "node:crypto"
import { initialConfigurationSummaryAfterMaterialization } from "../../workspace-project-runtime/domain/initial-configuration-summary.js"
import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { WorkspaceRuntimeProjectState } from "../../workspace-project-runtime/domain/workspace-runtime-project.js"
import type { KanbanFlowService } from "../../project-kanban-core/services/kanban-flow.service.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import { MANAGEMENT_APPROACHES, type ManagementApproach } from "../domain/management-approach.js"
import type { MethodologyAssessment } from "../domain/project-draft-assessment.js"
import {
  isOperationalListCharterSnapshotEmpty,
  toOperationalListCharterSnapshot,
  type OperationalListCharterSnapshotDto,
} from "../domain/operational-list-charter-snapshot.js"
import type { ProjectDraftCharter } from "../domain/project-draft-charter.js"
import {
  ProjectDraftInvalidOperationError,
  ProjectDraftNotFoundError,
} from "../domain/project-draft.errors.js"
import type { ProjectDraftState } from "../domain/project-draft.js"
import { emptyMaterializationMeta } from "../domain/project-draft-materialization.js"
import type { RecommendationResult } from "../domain/project-draft-recommendation.js"
import type { TraceEvent } from "../domain/project-draft-trace.js"
import {
  assertCanMarkNotReadyComplete,
  assertCanMaterialize,
  assertCanRecordDecision,
  assertCanRecordRecommendation,
  assertCanEditCharter,
  assertCanEditCaptureSections,
  resolveStatusAfterSaveAssessment,
  resolveStatusAfterSaveCharter,
} from "../policies/project-draft-transition.policy.js"
import type { ProjectDraftRepository } from "../persistence/project-draft.repository.js"
import { runWithTransactionPreferred } from "../persistence/run-preferred-transaction.js"
import { buildStubRecommendationResult } from "./project-draft-recommendation-stub.js"

/** Validación de dominio: cadenas vacías; el wizard permite crear sin nombre hasta el charter. */
const DEFAULT_PROJECT_DRAFT_DISPLAY_NAME = "Sin nombre"

function assertKnownApproach(approach: ManagementApproach): void {
  if (!(MANAGEMENT_APPROACHES as readonly string[]).includes(approach)) {
    throw new ProjectDraftInvalidOperationError(`Unknown management approach: ${approach}`)
  }
}

function appendTrace(draft: ProjectDraftState, event: Omit<TraceEvent, "at"> & { at?: Date }): void {
  draft.trace.push({
    type: event.type,
    at: event.at ?? new Date(),
    actorUserPublicId: event.actorUserPublicId,
    payload: event.payload,
  })
}

export class ProjectDraftService {
  constructor(
    private readonly repo: ProjectDraftRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly kanbanFlowService: KanbanFlowService,
  ) {}

  async createDraft(input: {
    workspacePublicId: string
    createdByUserPublicId: string
    projectName?: string
  }): Promise<ProjectDraftState> {
    const now = new Date()
    const trimmedName = input.projectName?.trim() ?? ""
    const projectName =
      trimmedName.length > 0 ? trimmedName.slice(0, 500) : DEFAULT_PROJECT_DRAFT_DISPLAY_NAME
    const draft: ProjectDraftState = {
      draftPublicId: randomUUID(),
      workspacePublicId: input.workspacePublicId,
      createdByUserPublicId: input.createdByUserPublicId,
      status: "definition_in_progress",
      projectName,
      charter: {},
      methodologyAssessment: {},
      recommendationResult: null,
      selectedApproach: null,
      wasRecommendationOverridden: null,
      overrideJustification: null,
      materializedProjectPublicId: null,
      trace: [],
      materialization: emptyMaterializationMeta(),
      createdAt: now,
      updatedAt: now,
    }
    appendTrace(draft, {
      type: "draft_created",
      actorUserPublicId: input.createdByUserPublicId,
      payload: { draftPublicId: draft.draftPublicId },
    })
    await this.repo.insert(draft)
    return draft
  }

  async getDraft(workspacePublicId: string, draftPublicId: string): Promise<ProjectDraftState> {
    const d = await this.repo.findByWorkspaceAndDraftPublicId(workspacePublicId, draftPublicId)
    if (!d) throw new ProjectDraftNotFoundError()
    return d
  }

  async listDraftsByWorkspace(workspacePublicId: string): Promise<ProjectDraftState[]> {
    return this.repo.listByWorkspacePublicId(workspacePublicId)
  }

  /**
   * Resúmenes de charter para enriquecer el listado de proyectos operativos (mismo `draftPublicId` que `sourceDraftPublicId`).
   * Una sola lectura de borradores del workspace; devuelve `null` si no hay borrador o el charter está vacío.
   */
  async getCharterSnapshotsByDraftIds(
    workspacePublicId: string,
    draftPublicIds: string[],
  ): Promise<Map<string, OperationalListCharterSnapshotDto | null>> {
    const out = new Map<string, OperationalListCharterSnapshotDto | null>()
    for (const id of draftPublicIds) {
      out.set(id, null)
    }
    if (draftPublicIds.length === 0) return out

    const want = new Set(draftPublicIds)
    const drafts = await this.repo.listByWorkspacePublicId(workspacePublicId)
    for (const d of drafts) {
      if (!want.has(d.draftPublicId)) continue
      const snap = toOperationalListCharterSnapshot(d.charter)
      out.set(
        d.draftPublicId,
        isOperationalListCharterSnapshotEmpty(snap) ? null : snap,
      )
    }
    return out
  }

  async saveCharter(
    workspacePublicId: string,
    draftPublicId: string,
    patch: Partial<ProjectDraftCharter>,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    assertCanEditCharter(draft)
    draft.charter = { ...draft.charter, ...patch }
    if (typeof draft.charter.name === "string" && draft.charter.name.trim()) {
      draft.projectName = draft.charter.name.trim()
    }
    draft.status = resolveStatusAfterSaveCharter(draft)
    appendTrace(draft, {
      type: "charter_updated",
      actorUserPublicId: options?.actorUserPublicId,
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    if (draft.status === "materialized") {
      await this.projectRuntimeService.updateProjectNameForSourceDraft(
        workspacePublicId,
        draftPublicId,
        draft.projectName,
      )
    }
    return draft
  }

  async saveAssessment(
    workspacePublicId: string,
    draftPublicId: string,
    patch: Partial<MethodologyAssessment>,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    assertCanEditCaptureSections(draft)
    draft.methodologyAssessment = { ...draft.methodologyAssessment, ...patch }
    draft.status = resolveStatusAfterSaveAssessment(draft)
    appendTrace(draft, {
      type: "assessment_updated",
      actorUserPublicId: options?.actorUserPublicId,
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    return draft
  }

  /**
   * Ejecuta el motor sustituto (stub), persiste `recommendationResult` y pasa a `recommended`.
   * Sustituir `buildStubRecommendationResult` por motor real sin cambiar contrato HTTP.
   */
  async recommendDraft(
    workspacePublicId: string,
    draftPublicId: string,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const result = buildStubRecommendationResult(await this.getDraft(workspacePublicId, draftPublicId))
    return this.recordRecommendation(workspacePublicId, draftPublicId, result, options)
  }

  /**
   * Persiste el resultado del motor. El motor en sí es TODO / servicio futuro;
   * aquí solo se valida estado y se guarda el agregado.
   */
  async recordRecommendation(
    workspacePublicId: string,
    draftPublicId: string,
    result: RecommendationResult,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    assertCanRecordRecommendation(draft)
    assertKnownApproach(result.suggestedApproach)
    draft.recommendationResult = { ...result, computedAt: result.computedAt ?? new Date() }
    draft.status = "recommended"
    appendTrace(draft, {
      type: "recommendation_recorded",
      actorUserPublicId: options?.actorUserPublicId,
      payload: { suggestedApproach: result.suggestedApproach },
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    return draft
  }

  async recordDecision(
    workspacePublicId: string,
    draftPublicId: string,
    input: {
      selectedApproach: ManagementApproach
      overrideJustification?: string | null
      actorUserPublicId?: string
    },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    assertCanRecordDecision(draft)
    assertKnownApproach(input.selectedApproach)
    const suggested = draft.recommendationResult!.suggestedApproach
    draft.selectedApproach = input.selectedApproach
    draft.wasRecommendationOverridden = input.selectedApproach !== suggested
    draft.overrideJustification = draft.wasRecommendationOverridden
      ? (input.overrideJustification ?? null)
      : null
    draft.status = "decision_recorded"
    appendTrace(draft, {
      type: "decision_recorded",
      actorUserPublicId: input.actorUserPublicId,
      payload: {
        selectedApproach: input.selectedApproach,
        wasRecommendationOverridden: draft.wasRecommendationOverridden,
      },
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    return draft
  }

  /**
   * Cierra el flujo sin proyecto operativo cuando el enfoque final es `not_ready_to_start`.
   * Idempotente si ya está en `not_ready_complete`.
   */
  async markNotReadyComplete(
    workspacePublicId: string,
    draftPublicId: string,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    if (draft.status === "not_ready_complete") {
      return draft
    }
    assertCanMarkNotReadyComplete(draft)
    draft.status = "not_ready_complete"
    draft.materializedProjectPublicId = null
    appendTrace(draft, {
      type: "not_ready_completed",
      actorUserPublicId: options?.actorUserPublicId,
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    return draft
  }

  /**
   * Elimina el borrador solo si no está materializado y no hay proyecto operativo ligado al mismo `draftPublicId`.
   */
  async deleteDraft(workspacePublicId: string, draftPublicId: string): Promise<void> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    if (draft.status === "materialized") {
      throw new ProjectDraftInvalidOperationError(
        "Cannot delete a materialized project draft. The operational project record remains in the workspace.",
      )
    }
    const runtime = await this.projectRuntimeService.findByWorkspaceAndSourceDraftPublicId(
      workspacePublicId,
      draftPublicId,
    )
    if (runtime) {
      throw new ProjectDraftInvalidOperationError(
        "Cannot delete this draft while an operational project is linked to it.",
      )
    }
    const deleted = await this.repo.deleteByWorkspaceAndDraftPublicId(workspacePublicId, draftPublicId)
    if (!deleted) {
      throw new ProjectDraftNotFoundError()
    }
  }

  /**
   * Materializa el proyecto operativo: persiste `WorkspaceRuntimeProject` (`workspace-project-runtime`),
   * asigna `materializedProjectPublicId` (UUID v4) y mantiene idempotencia.
   *
   * `projectPublicId` se genera aquí y se reutiliza en runtime y draft para una sola fuente de verdad.
   */
  async materializeDraft(
    workspacePublicId: string,
    draftPublicId: string,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    const draft = await this.getDraft(workspacePublicId, draftPublicId)
    if (draft.status === "materialized") {
      return draft
    }

    const existingRuntime = await this.projectRuntimeService.findByWorkspaceAndSourceDraftPublicId(
      workspacePublicId,
      draftPublicId,
    )
    if (existingRuntime) {
      assertCanMaterialize(draft)
      return await this.reconcileDraftWithWorkspaceRuntimeProject(draft, existingRuntime, options)
    }

    assertCanMaterialize(draft)

    draft.materialization = {
      ...draft.materialization,
      status: "in_progress",
      attemptedAt: new Date(),
      lastError: undefined,
    }
    appendTrace(draft, {
      type: "materialization_started",
      actorUserPublicId: options?.actorUserPublicId,
      payload: { selectedApproach: draft.selectedApproach },
    })

    const projectPublicId = randomUUID()
    const operationalApproach = draft.selectedApproach as OperationalApproach
    const summary = initialConfigurationSummaryAfterMaterialization(operationalApproach)

    const finalizeDraftFromRuntime = (runtime: WorkspaceRuntimeProjectState): void => {
      draft.materializedProjectPublicId = runtime.projectPublicId
      draft.materialization = {
        status: "completed",
        materializedProjectPublicId: runtime.projectPublicId,
        completedAt: new Date(),
        attemptedAt: draft.materialization.attemptedAt,
      }
      draft.status = "materialized"
      appendTrace(draft, {
        type: "materialization_completed",
        actorUserPublicId: options?.actorUserPublicId,
        payload: { materializedProjectPublicId: runtime.projectPublicId },
      })
      draft.updatedAt = new Date()
    }

    try {
      await runWithTransactionPreferred(
        async (session) => {
          const runtime = await this.projectRuntimeService.createWorkspaceRuntimeProjectFromMaterialization(
            {
              workspacePublicId,
              projectPublicId,
              sourceDraftPublicId: draftPublicId,
              projectName: draft.projectName,
              operationalApproach,
              initialConfigurationSummary: summary,
            },
            session,
          )
          await this.kanbanFlowService.ensureInitialFlowAfterKanbanMaterialization(
            workspacePublicId,
            runtime.projectPublicId,
            runtime.operationalApproach,
            session,
          )
          finalizeDraftFromRuntime(runtime)
          await this.repo.replace(draft, session)
        },
        async () => {
          const runtime = await this.projectRuntimeService.createWorkspaceRuntimeProjectFromMaterialization({
            workspacePublicId,
            projectPublicId,
            sourceDraftPublicId: draftPublicId,
            projectName: draft.projectName,
            operationalApproach,
            initialConfigurationSummary: summary,
          })
          await this.kanbanFlowService.ensureInitialFlowAfterKanbanMaterialization(
            workspacePublicId,
            runtime.projectPublicId,
            runtime.operationalApproach,
          )
          finalizeDraftFromRuntime(runtime)
          await this.repo.replace(draft)
        },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      draft.materialization = {
        ...draft.materialization,
        status: "failed",
        lastError: message,
      }
      appendTrace(draft, {
        type: "materialization_failed",
        actorUserPublicId: options?.actorUserPublicId,
        payload: { error: message },
      })
      draft.updatedAt = new Date()
      await this.repo.replace(draft)
      throw e
    }

    return draft
  }

  /**
   * Recuperación idempotente: el runtime ya existe (p. ej. insert previo y fallo al actualizar el draft).
   */
  private async reconcileDraftWithWorkspaceRuntimeProject(
    draft: ProjectDraftState,
    runtime: WorkspaceRuntimeProjectState,
    options?: { actorUserPublicId?: string },
  ): Promise<ProjectDraftState> {
    if (runtime.sourceDraftPublicId !== draft.draftPublicId) {
      throw new ProjectDraftInvalidOperationError("Operational project does not reference this draft.")
    }
    if (runtime.workspacePublicId !== draft.workspacePublicId) {
      throw new ProjectDraftInvalidOperationError("Operational project workspace does not match draft.")
    }

    draft.materialization = {
      ...draft.materialization,
      status: "completed",
      materializedProjectPublicId: runtime.projectPublicId,
      completedAt: new Date(),
      attemptedAt: draft.materialization.attemptedAt ?? new Date(),
      lastError: undefined,
    }
    draft.materializedProjectPublicId = runtime.projectPublicId
    draft.status = "materialized"
    appendTrace(draft, {
      type: "materialization_completed",
      actorUserPublicId: options?.actorUserPublicId,
      payload: {
        materializedProjectPublicId: runtime.projectPublicId,
        note: "reconciled_existing_operational_project",
      },
    })
    draft.updatedAt = new Date()
    await this.repo.replace(draft)
    await this.kanbanFlowService.ensureInitialFlowAfterKanbanMaterialization(
      runtime.workspacePublicId,
      runtime.projectPublicId,
      runtime.operationalApproach,
    )
    return draft
  }
}
