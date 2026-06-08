import { randomUUID } from "node:crypto"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ProjectImpedimentCommentState } from "../domain/project-impediment-comment.js"
import {
  ProjectImpedimentCommentNotFoundError,
  ImpedimentForbiddenError,
  ImpedimentNotFoundError,
  ImpedimentValidationError,
} from "../domain/impediment.errors.js"
import type { ImpedimentRepository } from "../persistence/impediment.repository.js"
import type { ListProjectImpedimentCommentsCursor, ProjectImpedimentCommentsRepository } from "../persistence/impediment-comments.repository.js"
import {
  assertCanModerateProjectImpedimentComments,
  assertCanMutateProjectImpediments,
  assertCanReadProjectImpediments,
} from "../policies/impediment-authorization.policy.js"

const DEFAULT_PAGE = 20

function normalizeBody(raw: string): string {
  const t = raw.trim()
  if (!t) {
    throw new ImpedimentValidationError("Comment body cannot be empty.")
  }
  if ([...t].length > 4000) {
    throw new ImpedimentValidationError("Comment body cannot exceed 4000 characters.")
  }
  return t
}

function decodeCursor(raw: string | undefined): ListProjectImpedimentCommentsCursor | null {
  if (!raw || raw.length === 0) return null
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8")
    const data = JSON.parse(json) as { t?: string; id?: string }
    if (typeof data.t !== "string" || typeof data.id !== "string") return null
    const createdAt = new Date(data.t)
    if (Number.isNaN(createdAt.getTime())) return null
    return { createdAt, commentPublicId: data.id }
  } catch {
    return null
  }
}

function encodeCursor(c: ListProjectImpedimentCommentsCursor): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), id: c.commentPublicId }), "utf8").toString(
    "base64url",
  )
}

export class ProjectImpedimentCommentsService {
  constructor(
    private readonly commentsRepo: ProjectImpedimentCommentsRepository,
    private readonly impedimentRepository: ImpedimentRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
  ) {}

  private async requireImpedimentExists(
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
  ) {
    const row = await this.impedimentRepository.findByProjectAndId(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
    )
    if (!row) {
      throw new ImpedimentNotFoundError()
    }
    return row
  }

  async listComments(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    limitInput: number | undefined,
    cursorRaw: string | undefined,
  ): Promise<{ comments: ProjectImpedimentCommentState[]; nextCursor: string | null }> {
    assertCanReadProjectImpediments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireImpedimentExists(workspacePublicId, projectPublicId, impedimentPublicId)

    const limit = Math.min(limitInput ?? DEFAULT_PAGE, 50)
    const after = decodeCursor(cursorRaw)
    if (cursorRaw && after === null) {
      throw new ImpedimentValidationError("Invalid cursor.")
    }

    const rows = await this.commentsRepo.listActivePage({
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      limit: limit + 1,
      after,
    })
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    let nextCursor: string | null = null
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!
      nextCursor = encodeCursor({ createdAt: last.createdAt, commentPublicId: last.commentPublicId })
    }
    return { comments: page, nextCursor }
  }

  async createComment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    bodyRaw: string,
  ): Promise<ProjectImpedimentCommentState> {
    assertCanReadProjectImpediments(actor)
    assertCanMutateProjectImpediments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireImpedimentExists(workspacePublicId, projectPublicId, impedimentPublicId)

    const body = normalizeBody(bodyRaw)
    const now = new Date()
    const comment: ProjectImpedimentCommentState = {
      commentPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      body,
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedByUserPublicId: null,
    }
    await this.commentsRepo.insert(comment)
    return comment
  }

  async patchComment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    commentPublicId: string,
    bodyRaw: string,
  ): Promise<ProjectImpedimentCommentState> {
    assertCanReadProjectImpediments(actor)
    assertCanMutateProjectImpediments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireImpedimentExists(workspacePublicId, projectPublicId, impedimentPublicId)

    const body = normalizeBody(bodyRaw)
    const existing = await this.commentsRepo.findActiveByIds(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      commentPublicId,
    )
    if (!existing) {
      throw new ProjectImpedimentCommentNotFoundError()
    }
    if (existing.createdByUserPublicId !== actor.userPublicId) {
      throw new ImpedimentForbiddenError("Only the author can edit this comment.")
    }
    const updated = await this.commentsRepo.updateBody({
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      commentPublicId,
      body,
      updatedAt: new Date(),
    })
    if (!updated) {
      throw new ProjectImpedimentCommentNotFoundError()
    }
    return updated
  }

  async deleteComment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    impedimentPublicId: string,
    commentPublicId: string,
  ): Promise<void> {
    assertCanReadProjectImpediments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireImpedimentExists(workspacePublicId, projectPublicId, impedimentPublicId)

    const existing = await this.commentsRepo.findActiveByIds(
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      commentPublicId,
    )
    if (!existing) {
      throw new ProjectImpedimentCommentNotFoundError()
    }

    const isAuthor = existing.createdByUserPublicId === actor.userPublicId
    if (isAuthor) {
      assertCanMutateProjectImpediments(actor)
    } else {
      assertCanModerateProjectImpedimentComments(actor)
    }

    const now = new Date()
    const deleted = await this.commentsRepo.softDelete({
      workspacePublicId,
      projectPublicId,
      impedimentPublicId,
      commentPublicId,
      deletedAt: now,
      deletedByUserPublicId: actor.userPublicId,
    })
    if (!deleted) {
      throw new ProjectImpedimentCommentNotFoundError()
    }
  }
}
