import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import type { ScrumBacklogItemState } from "../../project-scrum-backlog/domain/scrum-backlog-item.js"
import type { WorkItemCommentState } from "../domain/work-item-comment.js"
import type { ListCommentsCursor, WorkItemCommentsRepository } from "../persistence/work-item-comments.repository.js"
import { WorkItemCommentsService } from "./work-item-comments.service.js"

const ws = "00000000-0000-4000-8000-000000000001"
const proj = "proj-operational-1"
const itemId = "00000000-0000-4000-8000-0000000000aa"

function minimalItem(over: Partial<ScrumBacklogItemState> = {}): ScrumBacklogItemState {
  const now = new Date()
  return {
    backlogItemPublicId: itemId,
    workspacePublicId: ws,
    projectPublicId: proj,
    itemType: "user_story",
    title: "T",
    description: "",
    status: "open",
    sortOrder: 0,
    parentItemPublicId: null,
    createdByUserPublicId: "u-lead",
    createdAt: now,
    updatedAt: now,
    completedInSprintPublicId: null,
    assignedUserPublicId: null,
    assignmentUpdatedAt: null,
    assignmentUpdatedByUserPublicId: null,
    assignmentHistory: [],
    storyPoints: null,
    priorityLevel: "none",
    acceptanceCriteria: [],
    commentsCount: 0,
    kanbanColumnPublicId: null,
    isBlocked: false,
    blockedReason: null,
    ...over,
  }
}

class FakeCommentsRepo implements WorkItemCommentsRepository {
  rows: WorkItemCommentState[] = []

  async insert(comment: WorkItemCommentState): Promise<void> {
    this.rows.push({ ...comment })
  }

  async findActiveByIds(
    workspacePublicId: string,
    projectPublicId: string,
    backlogItemPublicId: string,
    commentPublicId: string,
  ): Promise<WorkItemCommentState | null> {
    return (
      this.rows.find(
        (r) =>
          r.workspacePublicId === workspacePublicId &&
          r.projectPublicId === projectPublicId &&
          r.backlogItemPublicId === backlogItemPublicId &&
          r.commentPublicId === commentPublicId &&
          r.deletedAt === null,
      ) ?? null
    )
  }

  async listActivePage(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    limit: number
    after: ListCommentsCursor | null
  }): Promise<WorkItemCommentState[]> {
    let list = this.rows.filter(
      (r) =>
        r.workspacePublicId === input.workspacePublicId &&
        r.projectPublicId === input.projectPublicId &&
        r.backlogItemPublicId === input.backlogItemPublicId &&
        r.deletedAt === null,
    )
    list.sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime()
      if (t !== 0) return t
      return a.commentPublicId.localeCompare(b.commentPublicId)
    })
    if (input.after) {
      list = list.filter((r) => {
        if (r.createdAt.getTime() > input.after!.createdAt.getTime()) return true
        if (r.createdAt.getTime() === input.after!.createdAt.getTime()) {
          return r.commentPublicId > input.after!.commentPublicId
        }
        return false
      })
    }
    return list.slice(0, input.limit)
  }

  async updateBody(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    body: string
    updatedAt: Date
  }): Promise<WorkItemCommentState | null> {
    const r = await this.findActiveByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.backlogItemPublicId,
      input.commentPublicId,
    )
    if (!r) return null
    r.body = input.body
    r.updatedAt = input.updatedAt
    return r
  }

  async softDelete(input: {
    workspacePublicId: string
    projectPublicId: string
    backlogItemPublicId: string
    commentPublicId: string
    deletedAt: Date
    deletedByUserPublicId: string
  }): Promise<WorkItemCommentState | null> {
    const r = await this.findActiveByIds(
      input.workspacePublicId,
      input.projectPublicId,
      input.backlogItemPublicId,
      input.commentPublicId,
    )
    if (!r) return null
    r.deletedAt = input.deletedAt
    r.deletedByUserPublicId = input.deletedByUserPublicId
    r.updatedAt = input.deletedAt
    return r
  }
}

class FakeBacklogRepo {
  item: ScrumBacklogItemState | null = minimalItem({ commentsCount: 0 })
  countAdjusts: number[] = []

  async findByProjectAndItemId(): Promise<ScrumBacklogItemState | null> {
    return this.item
  }

  async adjustCommentsCount(
    _w: string,
    _p: string,
    _id: string,
    delta: number,
  ): Promise<boolean> {
    this.countAdjusts.push(delta)
    if (!this.item) return false
    const next = this.item.commentsCount + delta
    if (next < 0) return false
    this.item = { ...this.item, commentsCount: next }
    return true
  }
}

class FakeRuntime {
  async requireScrumOrKanbanWorkspaceRuntimeProject(): Promise<void> {
    return
  }
}

describe("WorkItemCommentsService", () => {
  it("creates comment and increments count", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const actor = minimalWorkspaceMember({
      userPublicId: "u-dev",
      workspaceRoleMethodological: "scrum_developer",
    })
    const c = await svc.createComment(actor, ws, proj, itemId, "  hello  ")
    assert.equal(c.body, "hello")
    assert.equal(backlog.item!.commentsCount, 1)
    assert.equal(comments.rows.length, 1)
  })

  it("author can edit own comment", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const author = minimalWorkspaceMember({
      userPublicId: "u-a",
      workspaceRoleMethodological: "scrum_developer",
    })
    const created = await svc.createComment(author, ws, proj, itemId, "a")
    const updated = await svc.patchComment(
      author,
      ws,
      proj,
      itemId,
      created.commentPublicId,
      "b",
    )
    assert.equal(updated.body, "b")
  })

  it("forbids editing someone elses comment", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const author = minimalWorkspaceMember({
      userPublicId: "u-a",
      workspaceRoleMethodological: "scrum_developer",
    })
    const other = minimalWorkspaceMember({
      userPublicId: "u-b",
      workspaceRoleMethodological: "scrum_developer",
    })
    const created = await svc.createComment(author, ws, proj, itemId, "a")
    await assert.rejects(
      () => svc.patchComment(other, ws, proj, itemId, created.commentPublicId, "x"),
      /Only the author can edit/,
    )
  })

  it("author can soft-delete own comment and decrements count", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const author = minimalWorkspaceMember({
      userPublicId: "u-a",
      workspaceRoleMethodological: "scrum_developer",
    })
    const created = await svc.createComment(author, ws, proj, itemId, "a")
    await svc.deleteComment(author, ws, proj, itemId, created.commentPublicId)
    assert.equal(backlog.item!.commentsCount, 0)
    const listed = await svc.listComments(author, ws, proj, itemId, 20, undefined)
    assert.equal(listed.comments.length, 0)
  })

  it("coordinator can delete others comment", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const author = minimalWorkspaceMember({
      userPublicId: "u-a",
      workspaceRoleMethodological: "scrum_developer",
    })
    const sm = minimalWorkspaceMember({
      userPublicId: "u-sm",
      workspaceRoleMethodological: "scrum_master",
    })
    const created = await svc.createComment(author, ws, proj, itemId, "a")
    await svc.deleteComment(sm, ws, proj, itemId, created.commentPublicId)
    assert.equal(backlog.item!.commentsCount, 0)
  })

  it("auditor and scrum_coach can list but not create", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const auditor = minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })
    await svc.listComments(auditor, ws, proj, itemId, 20, undefined)
    await assert.rejects(
      () => svc.createComment(auditor, ws, proj, itemId, "nope"),
      /Auditor role is read-only/,
    )
    const coach = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" })
    await svc.listComments(coach, ws, proj, itemId, 20, undefined)
    await assert.rejects(
      () => svc.createComment(coach, ws, proj, itemId, "nope"),
      /Scrum coach role is read-only/,
    )
  })

  it("commentsCount excludes soft-deleted in list", async () => {
    const comments = new FakeCommentsRepo()
    const backlog = new FakeBacklogRepo()
    const svc = new WorkItemCommentsService(comments, backlog as never, new FakeRuntime() as never)
    const dev = minimalWorkspaceMember({
      userPublicId: "u-d",
      workspaceRoleMethodological: "scrum_developer",
    })
    const c1 = await svc.createComment(dev, ws, proj, itemId, "one")
    await svc.deleteComment(dev, ws, proj, itemId, c1.commentPublicId)
    assert.equal(backlog.item!.commentsCount, 0)
  })
})
