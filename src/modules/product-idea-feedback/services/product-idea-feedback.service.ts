import { randomUUID } from "node:crypto"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { WorkspaceRuntimeProjectLookup } from "../persistence/workspace-runtime-project-lookup.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProductIdea } from "../domain/product-idea.js"
import {
  productIdeaReactions,
  productIdeaSourceSurfaces,
  type ProductIdeaFeedbackEntry,
  type ProductIdeaFeedbackEntryReviewStatus,
  type ProductIdeaReadModel,
} from "../domain/product-idea-feedback-entry.js"
import {
  ProductIdeaFeedbackEntryConflictError,
  ProductIdeaFeedbackEntryError,
  ProductIdeaFeedbackEntryNotFoundError,
  ProductIdeaFeedbackEntryValidationError,
} from "../domain/product-idea-feedback.errors.js"
import { assertPlatformSessionCanReadProductIdeaFeedbackEntry, assertPlatformSessionCanReviewProductIdeaFeedbackEntry, isPlatformAuditorSession } from "../policies/product-idea-feedback-platform.policy.js"
import { assertCanSubmitProductIdeaFeedbackEntry } from "../policies/product-idea-feedback-workspace.policy.js"
import type { ProductIdeaFeedbackEntryAuditRepository } from "../persistence/product-idea-feedback-audit.repository.js"
import type { ProductIdeaPatch, ProductIdeaRepository } from "../persistence/product-idea.repository.js"
import type { AdminListFilter, ProductIdeaFeedbackEntryEntryRepository } from "../persistence/product-idea-feedback-entry.repository.js"

export type ProductIdeaFeedbackEntryAdminListItem = {
  feedbackPublicId: string
  createdAt: string
  reviewStatus: ProductIdeaFeedbackEntryReviewStatus
  ideaPublicId: string
  ideaTitle: string | null
  workspacePublicId: string
  reaction: ProductIdeaFeedbackEntry["reaction"]
  userPublicId: string
  submitterLabel: string
}

const MIN_TEXT = 20

function toProductIdeaReadModel(i: ProductIdea): ProductIdeaReadModel {
  return {
    ideaPublicId: i.ideaPublicId,
    title: i.title,
    summary: i.summary,
    description: i.description,
    status: i.status,
    isFeedbackEnabled: i.isFeedbackEnabled,
    area: i.area,
  }
}

function hasUsefulText(liked: string, could: string): boolean {
  const l = liked.trim()
  const c = could.trim()
  if (l.length === 0 && c.length === 0) return false
  if (l.length > 0 && c.length > 0) {
    return l.length >= MIN_TEXT || c.length >= MIN_TEXT
  }
  if (l.length > 0) return l.length >= MIN_TEXT
  return c.length >= MIN_TEXT
}

export class ProductIdeaFeedbackEntryService {
  constructor(
    private readonly ideas: ProductIdeaRepository,
    private readonly feedback: ProductIdeaFeedbackEntryEntryRepository,
    private readonly audit: ProductIdeaFeedbackEntryAuditRepository,
    private readonly operationalProjectLookup: WorkspaceRuntimeProjectLookup,
  ) {}

  private assertIdeaAcceptsWorkspaceFeedback(idea: ProductIdea): void {
    if (idea.status !== "published") {
      throw new ProductIdeaFeedbackEntryNotFoundError(
        "La idea no está disponible para feedback en este contexto.",
      )
    }
    if (!idea.isFeedbackEnabled) {
      throw new ProductIdeaFeedbackEntryError(
        "feedback_disabled",
        "El feedback no está habilitado para esta idea.",
        403,
      )
    }
  }

  private async assertProjectInWorkspace(
    workspacePublicId: string,
    projectPublicId: string,
  ): Promise<void> {
    const ok = await this.operationalProjectLookup.existsInWorkspace(workspacePublicId, projectPublicId)
    if (!ok) {
      throw new ProductIdeaFeedbackEntryValidationError(
        "invalid_project_context",
        "El proyecto indicado no existe en este workspace.",
      )
    }
  }

  /**
   * `GET` elegibilidad — web
   */
  /**
   * Ideas con feedback habilitado y publicadas, para el cliente web (miembro de workspace).
   */
  async listIdeasForWorkspace(
    actor: WorkspaceMemberState,
  ): Promise<{ items: ProductIdeaReadModel[] }> {
    assertCanSubmitProductIdeaFeedbackEntry(actor)
    const rows = await this.ideas.list({
      status: "published",
      isFeedbackEnabled: true,
      limit: 200,
      offset: 0,
    })
    return {
      items: rows.map((i) => toProductIdeaReadModel(i)),
    }
  }

  async getEligibility(
    _actor: WorkspaceMemberState,
    workspacePublicId: string,
    ideaPublicId: string,
  ): Promise<{ canSubmit: true; reason: null } | { canSubmit: false; reason: string }> {
    assertCanSubmitProductIdeaFeedbackEntry(_actor)
    const idea = await this.ideas.findByPublicId(ideaPublicId)
    if (!idea) {
      return { canSubmit: false, reason: "IDEA_NOT_VISIBLE" }
    }
    if (idea.status !== "published") {
      return { canSubmit: false, reason: "IDEA_NOT_VISIBLE" }
    }
    if (!idea.isFeedbackEnabled) {
      return { canSubmit: false, reason: "FEEDBACK_DISABLED" }
    }
    const existing = await this.feedback.findByWorkspaceIdeaUser(
      workspacePublicId,
      ideaPublicId,
      _actor.userPublicId,
    )
    if (existing) {
      return { canSubmit: false, reason: "ALREADY_SUBMITTED" }
    }
    return { canSubmit: true, reason: null }
  }

  async submit(params: {
    actor: WorkspaceMemberState
    workspacePublicId: string
    ideaPublicId: string
    reaction: (typeof productIdeaReactions)[number]
    likedWhat: string
    couldImproveWhat: string
    additionalComment: string | null
    sourceSurface: (typeof productIdeaSourceSurfaces)[number]
    projectPublicId: string | null
  }): Promise<{ feedbackPublicId: string }> {
    assertCanSubmitProductIdeaFeedbackEntry(params.actor)

    const idea = await this.ideas.findByPublicId(params.ideaPublicId)
    if (!idea) {
      throw new ProductIdeaFeedbackEntryNotFoundError("No se encontró la idea de producto.")
    }
    this.assertIdeaAcceptsWorkspaceFeedback(idea)

    const liked = params.likedWhat
    const could = params.couldImproveWhat
    if (!hasUsefulText(liked, could)) {
      throw new ProductIdeaFeedbackEntryValidationError(
        "VALIDATION_ERROR",
        `Se requiere al menos un texto con ${MIN_TEXT} caracteres en "qué te gustó" o "qué mejorarías".`,
      )
    }

    if (params.projectPublicId) {
      await this.assertProjectInWorkspace(params.workspacePublicId, params.projectPublicId)
    }

    const dup = await this.feedback.findByWorkspaceIdeaUser(
      params.workspacePublicId,
      params.ideaPublicId,
      params.actor.userPublicId,
    )
    if (dup) {
      throw new ProductIdeaFeedbackEntryConflictError()
    }

    const feedbackPublicId = randomUUID()
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId,
      ideaPublicId: params.ideaPublicId,
      workspacePublicId: params.workspacePublicId,
      projectPublicId: params.projectPublicId,
      userPublicId: params.actor.userPublicId,
      submitterDisplayName: params.actor.fullName?.trim() || "—",
      reaction: params.reaction,
      likedWhat: liked.trim(),
      couldImproveWhat: could.trim(),
      additionalComment: params.additionalComment?.trim() ? params.additionalComment.trim() : null,
      sourceSurface: params.sourceSurface,
      reviewStatus: "new",
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }

    await this.feedback.insert(row)
    await this.audit.append({
      feedbackPublicId,
      workspacePublicId: params.workspacePublicId,
      kind: "feedback_created",
      actorUserPublicId: params.actor.userPublicId,
      actorPlatformUserId: null,
      summary: "Feedback de producto creado",
      payloadBefore: null,
      payloadAfter: {
        ideaPublicId: params.ideaPublicId,
        reaction: params.reaction,
        userPublicId: params.actor.userPublicId,
      },
      occurredAt: now,
    })

    return { feedbackPublicId }
  }

  async listAdmin(
    session: PlatformSessionContext,
    filter: AdminListFilter,
  ): Promise<{ total: number; items: ProductIdeaFeedbackEntryAdminListItem[] }> {
    assertPlatformSessionCanReadProductIdeaFeedbackEntry(session)
    const { rows, total } = await this.feedback.listAdmin(filter)
    const items = await Promise.all(rows.map((r) => this.toAdminListItem(session, r)))
    return { total, items }
  }

  private async toAdminListItem(
    session: PlatformSessionContext,
    row: ProductIdeaFeedbackEntry,
  ): Promise<ProductIdeaFeedbackEntryAdminListItem> {
    const idea = await this.ideas.findByPublicId(row.ideaPublicId)
    return {
      feedbackPublicId: row.feedbackPublicId,
      createdAt: row.createdAt.toISOString(),
      reviewStatus: row.reviewStatus,
      ideaPublicId: row.ideaPublicId,
      ideaTitle: idea?.title ?? null,
      workspacePublicId: row.workspacePublicId,
      reaction: row.reaction,
      userPublicId: isPlatformAuditorSession(session) ? "—" : row.userPublicId,
      submitterLabel: row.submitterDisplayName,
    }
  }

  async getAdminDetail(
    session: PlatformSessionContext,
    feedbackPublicId: string,
  ): Promise<Record<string, unknown>> {
    assertPlatformSessionCanReadProductIdeaFeedbackEntry(session)
    const row = await this.feedback.findByPublicId(feedbackPublicId)
    if (!row) {
      throw new ProductIdeaFeedbackEntryNotFoundError("No se encontró el envío de feedback.")
    }
    const idea = await this.ideas.findByPublicId(row.ideaPublicId)
    const auditor = isPlatformAuditorSession(session)
    return {
      feedbackPublicId: row.feedbackPublicId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      reviewStatus: row.reviewStatus,
      reaction: row.reaction,
      likedWhat: row.likedWhat,
      couldImproveWhat: row.couldImproveWhat,
      additionalComment: row.additionalComment,
      sourceSurface: row.sourceSurface,
      workspacePublicId: row.workspacePublicId,
      projectPublicId: row.projectPublicId,
      userPublicId: auditor ? null : row.userPublicId,
      submitterDisplayName: row.submitterDisplayName,
      idea: idea
        ? {
            ideaPublicId: idea.ideaPublicId,
            title: idea.title,
            summary: idea.summary,
            description: idea.description,
            status: idea.status,
            isFeedbackEnabled: idea.isFeedbackEnabled,
            area: idea.area,
          }
        : { ideaPublicId: row.ideaPublicId, title: null },
      internalTags: row.internalTags,
      internalNotes: row.internalNotes,
      reviewedByPlatformUserId: row.reviewedByPlatformUserId,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    }
  }

  async patchAdmin(
    session: PlatformSessionContext,
    feedbackPublicId: string,
    body: {
      reviewStatus?: ProductIdeaFeedbackEntryReviewStatus
      internalTags?: string[]
      internalNotes?: string | null
    },
  ): Promise<Record<string, unknown>> {
    assertPlatformSessionCanReadProductIdeaFeedbackEntry(session)
    assertPlatformSessionCanReviewProductIdeaFeedbackEntry(session)

    const current = await this.feedback.findByPublicId(feedbackPublicId)
    if (!current) {
      throw new ProductIdeaFeedbackEntryNotFoundError("No se encontró el envío de feedback.")
    }

    const before = {
      reviewStatus: current.reviewStatus,
      internalTags: current.internalTags,
      internalNotes: current.internalNotes,
    }

    const now = new Date()
    const patch = {
      reviewStatus: body.reviewStatus ?? current.reviewStatus,
      internalTags: body.internalTags ?? current.internalTags,
      internalNotes: body.internalNotes !== undefined ? body.internalNotes : current.internalNotes,
      reviewedByPlatformUserId: session.platformUserId,
      reviewedAt: now,
    }

    if (
      !body.reviewStatus &&
      body.internalTags === undefined &&
      body.internalNotes === undefined
    ) {
      throw new ProductIdeaFeedbackEntryValidationError("VALIDATION_ERROR", "Nada que actualizar.")
    }

    const updated = await this.feedback.updateReviewMetadata(feedbackPublicId, {
      reviewStatus: patch.reviewStatus,
      internalTags: patch.internalTags,
      internalNotes: patch.internalNotes,
      reviewedByPlatformUserId: patch.reviewedByPlatformUserId,
      reviewedAt: patch.reviewedAt,
    })
    if (!updated) {
      throw new ProductIdeaFeedbackEntryNotFoundError()
    }

    await this.audit.append({
      feedbackPublicId,
      workspacePublicId: current.workspacePublicId,
      kind: "admin_review_updated",
      actorUserPublicId: null,
      actorPlatformUserId: session.platformUserId,
      summary: "Metadatos de revisión de feedback actualizados",
      payloadBefore: before,
      payloadAfter: {
        reviewStatus: updated.reviewStatus,
        internalTags: updated.internalTags,
        hasNotes: updated.internalNotes != null,
      },
      occurredAt: now,
    })

    return this.getAdminDetail(session, feedbackPublicId)
  }

  async listIdeasForPlatform(
    session: PlatformSessionContext,
    query: { status?: ProductIdea["status"]; limit: number; offset: number },
  ): Promise<{ total: number; items: ProductIdeaReadModel[] }> {
    assertPlatformSessionCanReadProductIdeaFeedbackEntry(session)
    const [rows, total] = await Promise.all([
      this.ideas.list({
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      }),
      this.ideas.countList({ status: query.status }),
    ])
    return {
      total,
      items: rows.map((i) => toProductIdeaReadModel(i)),
    }
  }

  async getIdeaForPlatform(
    session: PlatformSessionContext,
    ideaPublicId: string,
  ): Promise<ProductIdeaReadModel | null> {
    assertPlatformSessionCanReadProductIdeaFeedbackEntry(session)
    const idea = await this.ideas.findByPublicId(ideaPublicId)
    if (!idea) return null
    return toProductIdeaReadModel(idea)
  }

  async createIdeaForPlatform(
    session: PlatformSessionContext,
    input: {
      title: string
      summary: string
      description: string | null | undefined
      area: string
      status: ProductIdea["status"]
      isFeedbackEnabled: boolean
    },
  ): Promise<ProductIdeaReadModel> {
    assertPlatformSessionCanReviewProductIdeaFeedbackEntry(session)
    const ideaPublicId = randomUUID()
    const now = new Date()
    const desc = input.description
    const row: ProductIdea = {
      ideaPublicId,
      title: input.title.trim(),
      summary: input.summary.trim(),
      description: desc === null || desc === undefined ? null : desc.trim() || null,
      area: input.area.trim(),
      status: input.status,
      isFeedbackEnabled: input.isFeedbackEnabled,
      createdAt: now,
      updatedAt: now,
    }
    await this.ideas.insert(row)
    const created = await this.ideas.findByPublicId(ideaPublicId)
    if (!created) {
      throw new ProductIdeaFeedbackEntryError("internal_error", "No se pudo leer la idea recién creada.", 500)
    }
    return toProductIdeaReadModel(created)
  }

  async patchIdeaForPlatform(
    session: PlatformSessionContext,
    ideaPublicId: string,
    input: Partial<{
      title: string
      summary: string
      description: string | null
      area: string
      status: ProductIdea["status"]
      isFeedbackEnabled: boolean
    }>,
  ): Promise<ProductIdeaReadModel> {
    assertPlatformSessionCanReviewProductIdeaFeedbackEntry(session)
    const patch: ProductIdeaPatch = {}
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.summary !== undefined) patch.summary = input.summary.trim()
    if (input.description !== undefined) {
      patch.description = input.description === null ? null : input.description.trim() || null
    }
    if (input.area !== undefined) patch.area = input.area.trim()
    if (input.status !== undefined) patch.status = input.status
    if (input.isFeedbackEnabled !== undefined) patch.isFeedbackEnabled = input.isFeedbackEnabled
    if (Object.keys(patch).length === 0) {
      throw new ProductIdeaFeedbackEntryValidationError("VALIDATION_ERROR", "Nada que actualizar.")
    }
    const updated = await this.ideas.updateByPublicId(ideaPublicId, patch)
    if (!updated) {
      throw new ProductIdeaFeedbackEntryNotFoundError("No se encontró la idea de producto.")
    }
    return toProductIdeaReadModel(updated)
  }
}

function isProductIdeaFeedbackEntryError(e: unknown): e is ProductIdeaFeedbackEntryError {
  return e instanceof ProductIdeaFeedbackEntryError
}

export { isProductIdeaFeedbackEntryError }
