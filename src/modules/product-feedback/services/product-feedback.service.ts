import { randomUUID } from "node:crypto"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { ProductIdea } from "../../product-idea-feedback/domain/product-idea.js"
import type { WorkspaceRuntimeProjectLookup } from "../../product-idea-feedback/persistence/workspace-runtime-project-lookup.js"
import type { ProductIdeaRepository } from "../../product-idea-feedback/persistence/product-idea.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProductFeedbackMisroutingCategory, ProductFeedbackSubmission } from "../domain/product-feedback-submission.js"
import {
  productFeedbackMisroutingCategories,
  type ProductFeedbackReviewStatus,
} from "../domain/product-feedback-submission.js"
import {
  ProductFeedbackConflictError,
  ProductFeedbackError,
  ProductFeedbackIdeaNotFoundError,
  ProductFeedbackNotFoundError,
  ProductFeedbackValidationError,
} from "../domain/product-feedback.errors.js"
import {
  applyActionableGuard,
  assertPlatformSessionCanMutateProductFeedback,
  assertPlatformSessionCanReadProductFeedback,
  isPlatformAuditorSession,
} from "../policies/product-feedback-platform.policy.js"
import { assertCanSubmitProductFeedback } from "../policies/product-feedback-workspace.policy.js"
import type { ProductFeedbackAuditRepository } from "../persistence/product-feedback-audit.repository.js"
import type { ProductFeedbackSubmissionRepository } from "../persistence/product-feedback-submission.repository.js"
import type { SubmitProductFeedbackBody } from "../validation/product-feedback-http.schemas.js"
import {
  GENERAL_ENTRY_ROUTE,
  MAX_BODY,
  MAX_OPERATIONAL_APPROACH,
  MAX_SCREEN_CONTEXT_SERIALIZED,
  MAX_TITLE,
  MIN_BODY,
} from "../validation/product-feedback-http.schemas.js"
import type { PatchProductFeedbackBody } from "../validation/product-feedback-http.schemas.js"

const misroutingSet = new Set<string>(productFeedbackMisroutingCategories)

export type ProductFeedbackPlatformListQuery = {
  submissionType?: ProductFeedbackSubmission["submissionType"]
  status?: ProductFeedbackReviewStatus
  workspacePublicId?: string
  moduleKey?: string
  projectPublicId?: string
  ideaPublicId?: string
  misroutingCategory?: ProductFeedbackMisroutingCategory
  textSearch?: string
  fromInclusive?: Date
  toInclusive?: Date
  limit: number
  offset: number
}

export type ProductFeedbackAdminListItem = {
  submissionPublicId: string
  createdAt: string
  status: ProductFeedbackReviewStatus
  submissionType: ProductFeedbackSubmission["submissionType"]
  workspacePublicId: string
  userPublicId: string
  submitterLabel: string
  bodyPreview: string
  title: string | null
  ideaPublicId: string | null
}

function normalizeScreenContext(input: unknown): Record<string, unknown> | null {
  if (input === undefined || input === null) return null
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ProductFeedbackValidationError(
      "invalid_screen_context",
      "screenContext debe ser un objeto JSON (sin arrays en la raíz).",
    )
  }
  const raw = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.length > 64) continue
    if (typeof v === "string") {
      if (v.length > 256) continue
      out[k] = v
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v
    } else if (typeof v === "boolean") {
      out[k] = v
    } else if (v === null) {
      out[k] = null
    }
  }
  const serialized = JSON.stringify(out)
  if (serialized.length > MAX_SCREEN_CONTEXT_SERIALIZED) {
    throw new ProductFeedbackValidationError(
      "invalid_screen_context",
      `screenContext supera ${MAX_SCREEN_CONTEXT_SERIALIZED} caracteres serializados.`,
    )
  }
  return Object.keys(out).length === 0 ? null : out
}

export class ProductFeedbackService {
  constructor(
    private readonly ideas: ProductIdeaRepository,
    private readonly submissions: ProductFeedbackSubmissionRepository,
    private readonly audit: ProductFeedbackAuditRepository,
    private readonly operationalProjectLookup: WorkspaceRuntimeProjectLookup,
  ) {}

  private assertIdeaAcceptsWorkspaceFeedback(idea: ProductIdea): void {
    if (idea.status !== "published") {
      throw new ProductFeedbackIdeaNotFoundError("La idea no está disponible para feedback en este contexto.")
    }
    if (!idea.isFeedbackEnabled) {
      throw new ProductFeedbackError("feedback_disabled", "El feedback no está habilitado para esta idea.", 403)
    }
  }

  private async assertProjectInWorkspace(workspacePublicId: string, projectPublicId: string): Promise<void> {
    const ok = await this.operationalProjectLookup.existsInWorkspace(workspacePublicId, projectPublicId)
    if (!ok) {
      throw new ProductFeedbackValidationError(
        "invalid_project_context",
        "El proyecto indicado no existe en este workspace.",
      )
    }
  }

  private validateBodyAndTitle(bodyRaw: string, submissionType: ProductFeedbackSubmission["submissionType"], titleRaw: unknown): { body: string; title: string | null } {
    const body = bodyRaw.trim()
    if (body.length < MIN_BODY || body.length > MAX_BODY) {
      throw new ProductFeedbackValidationError(
        "body_validation",
        `El texto debe tener entre ${MIN_BODY} y ${MAX_BODY} caracteres (tras recortar espacios).`,
      )
    }
    let title: string | null
    if (titleRaw === undefined || titleRaw === null) {
      title = null
    } else if (typeof titleRaw !== "string") {
      throw new ProductFeedbackValidationError("title_validation", "El título no es válido.")
    } else {
      const t = titleRaw.trim()
      if (t.length > MAX_TITLE) {
        throw new ProductFeedbackValidationError("title_validation", `El título no puede superar ${MAX_TITLE} caracteres.`)
      }
      title = t.length === 0 ? null : t
    }
    if (submissionType === "new_feature_suggestion") {
      if (!title || title.length === 0) {
        throw new ProductFeedbackValidationError("title_required_for_suggestion", "La sugerencia requiere un título breve.")
      }
    }
    return { body, title }
  }

  async getEligibility(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    ideaPublicId: string,
  ): Promise<{ canSubmit: true; reason: null } | { canSubmit: false; reason: string }> {
    assertCanSubmitProductFeedback(actor)
    const idea = await this.ideas.findByPublicId(ideaPublicId)
    if (!idea) return { canSubmit: false, reason: "IDEA_NOT_VISIBLE" }
    try {
      this.assertIdeaAcceptsWorkspaceFeedback(idea)
    } catch {
      if (!idea.isFeedbackEnabled) return { canSubmit: false, reason: "FEEDBACK_DISABLED" }
      return { canSubmit: false, reason: "IDEA_NOT_VISIBLE" }
    }
    const existing = await this.submissions.findByWorkspaceIdeaUser(workspacePublicId, ideaPublicId, actor.userPublicId)
    if (existing) return { canSubmit: false, reason: "ALREADY_SUBMITTED_FOR_IDEA" }
    return { canSubmit: true, reason: null }
  }

  async submit(params: {
    actor: WorkspaceMemberState
    parsed: SubmitProductFeedbackBody
  }): Promise<{ submissionPublicId: string }> {
    assertCanSubmitProductFeedback(params.actor)
    const { parsed } = params

    const route =
      parsed.route === undefined || parsed.route === null || parsed.route.trim() === ""
        ? GENERAL_ENTRY_ROUTE
        : parsed.route.trim()

    const { body, title } = this.validateBodyAndTitle(parsed.body, parsed.submissionType, parsed.title)

    let operationalApproach: string | null = null
    if (parsed.operationalApproach != null && String(parsed.operationalApproach).trim()) {
      const o = String(parsed.operationalApproach).trim()
      if (o.length > MAX_OPERATIONAL_APPROACH) {
        throw new ProductFeedbackValidationError(
          "invalid_operational_approach",
          `operationalApproach no puede superar ${MAX_OPERATIONAL_APPROACH} caracteres.`,
        )
      }
      operationalApproach = o
    }

    const screenContext = normalizeScreenContext(parsed.screenContext)

    const ideaPublicId =
      parsed.ideaPublicId === undefined || parsed.ideaPublicId === null ? null : parsed.ideaPublicId

    if (ideaPublicId) {
      const idea = await this.ideas.findByPublicId(ideaPublicId)
      if (!idea) {
        throw new ProductFeedbackIdeaNotFoundError()
      }
      this.assertIdeaAcceptsWorkspaceFeedback(idea)
      const dup = await this.submissions.findByWorkspaceIdeaUser(
        parsed.workspacePublicId,
        ideaPublicId,
        params.actor.userPublicId,
      )
      if (dup) {
        throw new ProductFeedbackConflictError("duplicate_idea_submission", "Ya enviaste feedback para esta idea.", 409)
      }
    }

    const projectPublicId =
      parsed.projectPublicId === undefined || parsed.projectPublicId === null ? null : parsed.projectPublicId
    if (projectPublicId) {
      await this.assertProjectInWorkspace(parsed.workspacePublicId, projectPublicId)
    }

    const reaction =
      parsed.reaction === undefined || parsed.reaction === null || String(parsed.reaction).trim() === ""
        ? null
        : String(parsed.reaction).trim().slice(0, 64)

    const moduleKey =
      parsed.moduleKey === undefined || parsed.moduleKey === null || String(parsed.moduleKey).trim() === ""
        ? null
        : String(parsed.moduleKey).trim().slice(0, 128)

    const submissionPublicId = randomUUID()
    const now = new Date()
    const row: ProductFeedbackSubmission = {
      submissionPublicId,
      workspacePublicId: parsed.workspacePublicId,
      userPublicId: params.actor.userPublicId,
      submitterDisplayName: params.actor.fullName?.trim() || "—",
      submissionType: parsed.submissionType,
      title,
      body,
      ideaPublicId,
      moduleKey,
      route,
      screenContext,
      projectPublicId,
      operationalApproach,
      sourceSurface: parsed.sourceSurface.trim().slice(0, 128),
      reaction,
      status: "new",
      internalTags: [],
      internalNotes: null,
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.submissions.insert(row)
    await this.audit.append({
      eventPublicId: randomUUID(),
      submissionPublicId,
      workspacePublicId: parsed.workspacePublicId,
      kind: "submission_created",
      actorUserPublicId: params.actor.userPublicId,
      actorPlatformUserId: null,
      summary: "Product feedback submission creado",
      payloadBefore: null,
      payloadAfter: {
        submissionType: parsed.submissionType,
        ideaPublicId,
        userPublicId: params.actor.userPublicId,
        sourceSurface: row.sourceSurface,
      },
      occurredAt: now,
    })

    return { submissionPublicId }
  }

  async listAdmin(
    session: PlatformSessionContext,
    query: ProductFeedbackPlatformListQuery,
  ): Promise<{ total: number; items: ProductFeedbackAdminListItem[] }> {
    assertPlatformSessionCanReadProductFeedback(session)
    const { rows, total } = await this.submissions.listPlatform({
      submissionType: query.submissionType,
      status: query.status,
      workspacePublicId: query.workspacePublicId,
      moduleKey: query.moduleKey,
      projectPublicId: query.projectPublicId,
      ideaPublicId: query.ideaPublicId,
      misroutingCategory: query.misroutingCategory,
      textSearch: query.textSearch,
      fromInclusive: query.fromInclusive,
      toInclusive: query.toInclusive,
      limit: query.limit,
      offset: query.offset,
    })
    const auditor = isPlatformAuditorSession(session)
    const items: ProductFeedbackAdminListItem[] = rows.map((r) => ({
      submissionPublicId: r.submissionPublicId,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      submissionType: r.submissionType,
      workspacePublicId: r.workspacePublicId,
      userPublicId: auditor ? "—" : r.userPublicId,
      submitterLabel: r.submitterDisplayName,
      bodyPreview: r.body.length > 200 ? `${r.body.slice(0, 200)}…` : r.body,
      title: r.title,
      ideaPublicId: r.ideaPublicId,
    }))
    return { total, items }
  }

  private async toAdminDetail(session: PlatformSessionContext, row: ProductFeedbackSubmission): Promise<Record<string, unknown>> {
    const idea = row.ideaPublicId ? await this.ideas.findByPublicId(row.ideaPublicId) : null
    const auditor = isPlatformAuditorSession(session)
    const base: Record<string, unknown> = {
      submissionPublicId: row.submissionPublicId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      submissionType: row.submissionType,
      title: row.title,
      body: row.body,
      ideaPublicId: row.ideaPublicId,
      moduleKey: row.moduleKey,
      route: row.route,
      screenContext: row.screenContext,
      projectPublicId: row.projectPublicId,
      operationalApproach: row.operationalApproach,
      sourceSurface: row.sourceSurface,
      reaction: row.reaction,
      workspacePublicId: row.workspacePublicId,
      userPublicId: auditor ? null : row.userPublicId,
      submitterDisplayName: row.submitterDisplayName,
      status: row.status,
      internalTags: row.internalTags,
      misroutingCategory: row.misroutingCategory,
      duplicateOfSubmissionPublicId: row.duplicateOfSubmissionPublicId,
      reviewDisposition: row.reviewDisposition,
      reviewedByPlatformUserId: row.reviewedByPlatformUserId,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      idea: idea
        ? {
            ideaPublicId: idea.ideaPublicId,
            title: idea.title,
            summary: idea.summary,
            status: idea.status,
            isFeedbackEnabled: idea.isFeedbackEnabled,
            area: idea.area,
          }
        : row.ideaPublicId
          ? { ideaPublicId: row.ideaPublicId, title: null }
          : null,
    }
    if (!auditor) {
      base.internalNotes = row.internalNotes
    }
    return base
  }

  async getAdminDetail(session: PlatformSessionContext, submissionPublicId: string): Promise<Record<string, unknown>> {
    assertPlatformSessionCanReadProductFeedback(session)
    const row = await this.submissions.findByPublicId(submissionPublicId)
    if (!row) throw new ProductFeedbackNotFoundError()
    return this.toAdminDetail(session, row)
  }

  async patchAdmin(
    session: PlatformSessionContext,
    submissionPublicId: string,
    body: PatchProductFeedbackBody,
  ): Promise<Record<string, unknown>> {
    assertPlatformSessionCanReadProductFeedback(session)
    assertPlatformSessionCanMutateProductFeedback(session)

    const current = await this.submissions.findByPublicId(submissionPublicId)
    if (!current) throw new ProductFeedbackNotFoundError()

    const resolvedStatus: ProductFeedbackReviewStatus =
      body.status !== undefined ? body.status : current.status
    applyActionableGuard(session, body.status)

    if (body.misroutingCategory !== undefined && body.misroutingCategory !== null) {
      if (!misroutingSet.has(body.misroutingCategory)) {
        throw new ProductFeedbackValidationError("invalid_misrouting_category", "Categoría de mal encaminamiento inválida.")
      }
      if (resolvedStatus !== "misrouted_support") {
        throw new ProductFeedbackValidationError(
          "invalid_misrouting_category",
          "misroutingCategory solo aplica cuando el estado es misrouted_support.",
        )
      }
    }

    let nextDuplicate: string | null
    if (resolvedStatus === "duplicate") {
      const target =
        body.duplicateOfSubmissionPublicId !== undefined
          ? body.duplicateOfSubmissionPublicId
          : current.duplicateOfSubmissionPublicId
      if (!target || target === submissionPublicId) {
        throw new ProductFeedbackValidationError(
          "duplicate_target_required",
          "Marcar como duplicado requiere duplicateOfSubmissionPublicId válido y distinto de este envío.",
        )
      }
      const other = await this.submissions.findByPublicId(target)
      if (!other) {
        throw new ProductFeedbackValidationError("duplicate_target_not_found", "El envío referenciado no existe.", 422)
      }
      nextDuplicate = target
    } else {
      nextDuplicate = null
    }

    let nextIdeaId = current.ideaPublicId
    if (body.ideaPublicId !== undefined) {
      const newIdea = body.ideaPublicId
      if (newIdea === null) {
        nextIdeaId = null
      } else {
        const idea = await this.ideas.findByPublicId(newIdea)
        if (!idea) {
          throw new ProductFeedbackIdeaNotFoundError("No se encontró la idea de producto indicada.")
        }
        const conflict = await this.submissions.findByWorkspaceIdeaUser(
          current.workspacePublicId,
          newIdea,
          current.userPublicId,
        )
        if (conflict && conflict.submissionPublicId !== submissionPublicId) {
          throw new ProductFeedbackConflictError(
            "duplicate_idea_submission",
            "Ya existe otro envío del mismo usuario para esta idea en el workspace.",
            409,
          )
        }
        nextIdeaId = newIdea
      }
    }

    const now = new Date()
    const before = {
      status: current.status,
      internalTags: current.internalTags,
      internalNotes: current.internalNotes,
      misroutingCategory: current.misroutingCategory,
      duplicateOfSubmissionPublicId: current.duplicateOfSubmissionPublicId,
      ideaPublicId: current.ideaPublicId,
      reviewDisposition: current.reviewDisposition,
    }

    const nextTags = body.internalTags !== undefined ? body.internalTags : current.internalTags
    const nextNotes = body.internalNotes !== undefined ? body.internalNotes : current.internalNotes
    let nextMisrouting = current.misroutingCategory
    if (body.misroutingCategory !== undefined) {
      nextMisrouting = body.misroutingCategory
    }
    if (resolvedStatus !== "misrouted_support") {
      nextMisrouting = null
    }

    const nextDisposition =
      body.reviewDisposition !== undefined ? body.reviewDisposition : current.reviewDisposition

    const updated = await this.submissions.updateReviewAndAssociations(submissionPublicId, {
      status: resolvedStatus,
      internalTags: nextTags,
      internalNotes: nextNotes,
      misroutingCategory: nextMisrouting,
      duplicateOfSubmissionPublicId: nextDuplicate,
      ideaPublicId: nextIdeaId,
      reviewDisposition: nextDisposition,
      reviewedByPlatformUserId: session.platformUserId,
      reviewedAt: now,
    })
    if (!updated) throw new ProductFeedbackNotFoundError()

    const ideaChanged = before.ideaPublicId !== updated.ideaPublicId
    await this.audit.append({
      eventPublicId: randomUUID(),
      submissionPublicId,
      workspacePublicId: current.workspacePublicId,
      kind: ideaChanged ? "admin_idea_associated" : "admin_review_updated",
      actorUserPublicId: null,
      actorPlatformUserId: session.platformUserId,
      summary: ideaChanged ? "Asociación de idea actualizada en triage" : "Metadatos de triage actualizados",
      payloadBefore: before,
      payloadAfter: {
        status: updated.status,
        internalTags: updated.internalTags,
        hasNotes: updated.internalNotes != null,
        misroutingCategory: updated.misroutingCategory,
        duplicateOfSubmissionPublicId: updated.duplicateOfSubmissionPublicId,
        ideaPublicId: updated.ideaPublicId,
        reviewDisposition: updated.reviewDisposition,
      },
      occurredAt: now,
    })

    return this.getAdminDetail(session, submissionPublicId)
  }
}

export function isProductFeedbackServiceError(e: unknown): e is ProductFeedbackError {
  return e instanceof ProductFeedbackError
}
