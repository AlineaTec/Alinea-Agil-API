import { randomUUID } from "node:crypto"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumBacklogRepository } from "../../project-scrum-backlog/persistence/scrum-backlog.repository.js"
import type { WorkItemCommentState } from "../domain/work-item-comment.js"
import {
  WorkItemCommentsForbiddenError,
  WorkItemCommentsNotFoundError,
  WorkItemCommentsValidationError,
} from "../domain/work-item-comments.errors.js"
import {
  assertCanModerateWorkItemComments,
  assertCanMutateOwnWorkItemComment,
  assertCanReadWorkItemComments,
} from "../policies/work-item-comments-authorization.policy.js"
import type { ListCommentsCursor, WorkItemCommentsRepository } from "../persistence/work-item-comments.repository.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkActivityNotificationFanoutService } from "../../work-activity-notifications/services/work-activity-notification-fanout.service.js"
import { parseMentionedUserPublicIdsFromComment } from "../../work-activity-notifications/policies/comment-mention-parse.policy.js"

const DEFAULT_PAGE = 20

function normalizeBody(raw: string): string {
  const t = raw.trim()
  if (!t) {
    throw new WorkItemCommentsValidationError("Comment body cannot be empty.")
  }
  if ([...t].length > 4000) {
    throw new WorkItemCommentsValidationError("Comment body cannot exceed 4000 characters.")
  }
  return t
}

function decodeCursor(raw: string | undefined): ListCommentsCursor | null {
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

function encodeCursor(c: ListCommentsCursor): string {
  return Buffer.from(JSON.stringify({ t: c.createdAt.toISOString(), id: c.commentPublicId }), "utf8").toString(
    "base64url",
  )
}

export class WorkItemCommentsService {
  constructor(
    private readonly commentsRepo: WorkItemCommentsRepository,
    private readonly backlogRepo: ScrumBacklogRepository,
    private readonly projectRuntimeService: ProjectRuntimeService,
    private readonly workspaceUserService: WorkspaceUserService | null = null,
    private readonly workActivityNotifications: WorkActivityNotificationFanoutService | null = null,
  ) {}

  private async requireBacklogItemExists(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
  ) {
    const item = await this.backlogRepo.findByProjectAndItemId(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
    )
    if (!item) {
      throw new WorkItemCommentsNotFoundError("Backlog item not found.")
    }
    return item
  }

  async listComments(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    limitInput: number | undefined,
    cursorRaw: string | undefined,
  ): Promise<{ comments: WorkItemCommentState[]; nextCursor: string | null }> {
    assertCanReadWorkItemComments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const limit = Math.min(limitInput ?? DEFAULT_PAGE, 50)
    const after = decodeCursor(cursorRaw)
    if (cursorRaw && after === null) {
      throw new WorkItemCommentsValidationError("Invalid cursor.")
    }

    const rows = await this.commentsRepo.listActivePage({
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
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
    backlogItemPublicId: string,
    bodyRaw: string,
  ): Promise<WorkItemCommentState> {
    assertCanReadWorkItemComments(actor)
    assertCanMutateOwnWorkItemComment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    const item = await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const body = normalizeBody(bodyRaw)
    const now = new Date()
    const comment: WorkItemCommentState = {
      commentPublicId: randomUUID(),
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      body,
      createdByUserPublicId: actor.userPublicId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedByUserPublicId: null,
    }

    await this.commentsRepo.insert(comment)
    const inc = await this.backlogRepo.adjustCommentsCount(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      1,
    )
    if (!inc) {
      throw new Error("work_item_comment_count_increment_failed")
    }

    if (this.workspaceUserService && this.workActivityNotifications) {
      const members = await this.workspaceUserService.listMembers(workspacePublicId)
      const mentionedUserPublicIds = parseMentionedUserPublicIdsFromComment(body, members, actor.userPublicId)
      void this.workActivityNotifications
        .onCommentCreated({
          workspacePublicId,
          projectPublicId,
          workItemPublicId: backlogItemPublicId,
          itemTitle: item.title,
          commentPublicId: comment.commentPublicId,
          commentBody: body,
          assigneeUserPublicId: item.assignedUserPublicId,
          actor,
          mentionedUserPublicIds,
          at: now,
        })
        .catch((e) => {
          console.error("[work-activity-notifications] fanout failed", e)
        })
    }

    return comment
  }

  async patchComment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    commentPublicId: string,
    bodyRaw: string,
  ): Promise<WorkItemCommentState> {
    assertCanReadWorkItemComments(actor)
    assertCanMutateOwnWorkItemComment(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const body = normalizeBody(bodyRaw)
    const existing = await this.commentsRepo.findActiveByIds(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      commentPublicId,
    )
    if (!existing) {
      throw new WorkItemCommentsNotFoundError()
    }
    if (existing.createdByUserPublicId !== actor.userPublicId) {
      throw new WorkItemCommentsForbiddenError("Only the author can edit this comment.")
    }

    const updated = await this.commentsRepo.updateBody({
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      commentPublicId,
      body,
      updatedAt: new Date(),
    })
    if (!updated) {
      throw new WorkItemCommentsNotFoundError()
    }
    return updated
  }

  async deleteComment(
    actor: WorkspaceMemberState,
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    commentPublicId: string,
  ): Promise<void> {
    assertCanReadWorkItemComments(actor)
    await this.projectRuntimeService.requireScrumOrKanbanWorkspaceRuntimeProject(workspacePublicId, projectPublicId)
    await this.requireBacklogItemExists(workspacePublicId, projectPublicId, backlogItemPublicId)

    const existing = await this.commentsRepo.findActiveByIds(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      commentPublicId,
    )
    if (!existing) {
      throw new WorkItemCommentsNotFoundError()
    }

    const isAuthor = existing.createdByUserPublicId === actor.userPublicId
    if (isAuthor) {
      assertCanMutateOwnWorkItemComment(actor)
    } else {
      assertCanModerateWorkItemComments(actor)
    }

    const now = new Date()
    const deleted = await this.commentsRepo.softDelete({
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      commentPublicId,
      deletedAt: now,
      deletedByUserPublicId: actor.userPublicId,
    })
    if (!deleted) {
      throw new WorkItemCommentsNotFoundError()
    }

    const dec = await this.backlogRepo.adjustCommentsCount(
      workspacePublicId,
      projectPublicId,
      backlogItemPublicId,
      -1,
    )
    if (!dec) {
      throw new Error("work_item_comment_count_decrement_failed")
    }
  }
}
