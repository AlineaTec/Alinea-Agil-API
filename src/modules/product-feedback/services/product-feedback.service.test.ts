import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { ProductIdea } from "../../product-idea-feedback/domain/product-idea.js"
import type { ProductIdeaPatch, ProductIdeaRepository } from "../../product-idea-feedback/persistence/product-idea.repository.js"
import type { WorkspaceRuntimeProjectLookup } from "../../product-idea-feedback/persistence/workspace-runtime-project-lookup.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProductFeedbackSubmission } from "../domain/product-feedback-submission.js"
import type { ProductFeedbackAuditAppendInput } from "../persistence/product-feedback-audit.repository.js"
import type { ProductFeedbackAuditRepository } from "../persistence/product-feedback-audit.repository.js"
import type {
  PlatformSubmissionListFilter,
  ProductFeedbackSubmissionRepository,
  SubmissionReviewPatch,
} from "../persistence/product-feedback-submission.repository.js"
import { GENERAL_ENTRY_ROUTE } from "../validation/product-feedback-http.schemas.js"
import { ProductFeedbackService } from "./product-feedback.service.js"

function member(over: Partial<WorkspaceMemberState> = {}): WorkspaceMemberState {
  const now = new Date()
  return {
    membershipPublicId: randomUUID(),
    workspacePublicId: randomUUID(),
    userPublicId: randomUUID(),
    emailNormalized: "u@test.com",
    fullName: "Test User",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: "scrum_developer",
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function operatorSession(): PlatformSessionContext {
  return { platformUserId: randomUUID(), email: "o@test.com", role: "platform_operator" }
}
function superSession(): PlatformSessionContext {
  return { platformUserId: randomUUID(), email: "s@test.com", role: "platform_super_admin" }
}
function auditorSession(): PlatformSessionContext {
  return { platformUserId: randomUUID(), email: "a@test.com", role: "platform_auditor" }
}

const now = new Date()

function baseIdea(id: string): ProductIdea {
  return {
    ideaPublicId: id,
    title: "Idea",
    summary: "S",
    description: null,
    area: "other",
    status: "published",
    isFeedbackEnabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

class MemoryIdeas implements ProductIdeaRepository {
  constructor(public ideas: Map<string, ProductIdea>) {}
  async findByPublicId(id: string): Promise<ProductIdea | null> {
    return this.ideas.get(id) ?? null
  }
  async list(
    filter: { status?: ProductIdea["status"]; isFeedbackEnabled?: boolean; limit: number; offset: number },
  ): Promise<ProductIdea[]> {
    const all = [...this.ideas.values()].filter((i) => {
      if (filter.status && i.status !== filter.status) return false
      if (filter.isFeedbackEnabled !== undefined && i.isFeedbackEnabled !== filter.isFeedbackEnabled) return false
      return true
    })
    return all.slice(filter.offset, filter.offset + filter.limit)
  }
  async countList(filter: { status?: ProductIdea["status"]; isFeedbackEnabled?: boolean }): Promise<number> {
    return [...this.ideas.values()].filter((i) => {
      if (filter.status && i.status !== filter.status) return false
      if (filter.isFeedbackEnabled !== undefined && i.isFeedbackEnabled !== filter.isFeedbackEnabled) return false
      return true
    }).length
  }
  async insert(idea: ProductIdea): Promise<void> {
    this.ideas.set(idea.ideaPublicId, idea)
  }
  async updateByPublicId(ideaPublicId: string, patch: ProductIdeaPatch): Promise<ProductIdea | null> {
    const cur = this.ideas.get(ideaPublicId)
    if (!cur) return null
    const next = { ...cur, ...patch, updatedAt: new Date() }
    this.ideas.set(ideaPublicId, next)
    return { ...next }
  }
}

class MemorySubmissions implements ProductFeedbackSubmissionRepository {
  constructor(public rows: Map<string, ProductFeedbackSubmission>) {}
  async insert(row: ProductFeedbackSubmission): Promise<void> {
    this.rows.set(row.submissionPublicId, { ...row })
  }
  async findByPublicId(id: string): Promise<ProductFeedbackSubmission | null> {
    const r = this.rows.get(id)
    return r ? { ...r } : null
  }
  async findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductFeedbackSubmission | null> {
    for (const r of this.rows.values()) {
      if (
        r.workspacePublicId === workspacePublicId &&
        r.ideaPublicId === ideaPublicId &&
        r.userPublicId === userPublicId
      ) {
        return { ...r }
      }
    }
    return null
  }
  async listPlatform(filter: PlatformSubmissionListFilter): Promise<{
    rows: ProductFeedbackSubmission[]
    total: number
  }> {
    let all = [...this.rows.values()]
    if (filter.submissionType) all = all.filter((r) => r.submissionType === filter.submissionType)
    if (filter.status) all = all.filter((r) => r.status === filter.status)
    if (filter.workspacePublicId) all = all.filter((r) => r.workspacePublicId === filter.workspacePublicId)
    if (filter.moduleKey) all = all.filter((r) => r.moduleKey === filter.moduleKey)
    if (filter.projectPublicId) all = all.filter((r) => r.projectPublicId === filter.projectPublicId)
    if (filter.ideaPublicId) all = all.filter((r) => r.ideaPublicId === filter.ideaPublicId)
    if (filter.misroutingCategory) all = all.filter((r) => r.misroutingCategory === filter.misroutingCategory)
    if (filter.textSearch?.trim()) {
      const t = filter.textSearch.trim().toLowerCase()
      all = all.filter(
        (r) => r.body.toLowerCase().includes(t) || (r.title?.toLowerCase().includes(t) ?? false),
      )
    }
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const total = all.length
    const rows = all.slice(filter.offset, filter.offset + filter.limit)
    return { rows, total }
  }
  async updateReviewAndAssociations(
    submissionPublicId: string,
    patch: SubmissionReviewPatch,
  ): Promise<ProductFeedbackSubmission | null> {
    const cur = this.rows.get(submissionPublicId)
    if (!cur) return null
    const next: ProductFeedbackSubmission = {
      ...cur,
      status: patch.status ?? cur.status,
      internalTags: patch.internalTags ?? cur.internalTags,
      internalNotes: patch.internalNotes !== undefined ? patch.internalNotes : cur.internalNotes,
      misroutingCategory:
        patch.misroutingCategory !== undefined ? patch.misroutingCategory : cur.misroutingCategory,
      duplicateOfSubmissionPublicId:
        patch.duplicateOfSubmissionPublicId !== undefined
          ? patch.duplicateOfSubmissionPublicId
          : cur.duplicateOfSubmissionPublicId,
      ideaPublicId: patch.ideaPublicId !== undefined ? patch.ideaPublicId : cur.ideaPublicId,
      reviewDisposition:
        patch.reviewDisposition !== undefined ? patch.reviewDisposition : cur.reviewDisposition,
      reviewedByPlatformUserId: patch.reviewedByPlatformUserId,
      reviewedAt: patch.reviewedAt,
      updatedAt: new Date(),
    }
    this.rows.set(submissionPublicId, next)
    return { ...next }
  }
}

class MemoryAudit implements ProductFeedbackAuditRepository {
  public events: ProductFeedbackAuditAppendInput[] = []
  async append(input: ProductFeedbackAuditAppendInput): Promise<void> {
    this.events.push(input)
  }
}

const projects = new Set<string>()

function lookup(): WorkspaceRuntimeProjectLookup {
  return {
    existsInWorkspace: async (ws: string, proj: string) =>
      projects.has(`${ws}:${proj}`),
  }
}

function svc(ideas: Map<string, ProductIdea>, rows: Map<string, ProductFeedbackSubmission>) {
  return new ProductFeedbackService(new MemoryIdeas(ideas), new MemorySubmissions(rows), new MemoryAudit(), lookup())
}

describe("ProductFeedbackService", () => {
  it("creates existing_feature_feedback without title", async () => {
    const m = member()
    const ideas = new Map<string, ProductIdea>()
    const rows = new Map<string, ProductFeedbackSubmission>()
    const s = svc(ideas, rows)
    const out = await s.submit({
      actor: m,
      parsed: {
        workspacePublicId: m.workspacePublicId,
        submissionType: "existing_feature_feedback",
        body: "x".repeat(25),
        sourceSurface: "contextual_button",
      },
    })
    assert.ok(out.submissionPublicId)
    assert.equal(rows.size, 1)
  })

  it("requires title for new_feature_suggestion", async () => {
    const m = member()
    const s = svc(new Map(), new Map())
    await assert.rejects(
      () =>
        s.submit({
          actor: m,
          parsed: {
            workspacePublicId: m.workspacePublicId,
            submissionType: "new_feature_suggestion",
            title: null,
            body: "y".repeat(22),
            sourceSurface: "global_help",
          },
        }),
      (e: unknown) => (e as { code: string }).code === "title_required_for_suggestion",
    )
  })

  it("rejects body out of limits", async () => {
    const m = member()
    const s = svc(new Map(), new Map())
    await assert.rejects(
      () =>
        s.submit({
          actor: m,
          parsed: {
            workspacePublicId: m.workspacePublicId,
            submissionType: "existing_feature_feedback",
            body: "short",
            sourceSurface: "main_menu",
          },
        }),
      (e: unknown) => (e as { code: string }).code === "body_validation",
    )
  })

  it("defaults route to general_entry when missing", async () => {
    const m = member()
    const rows = new Map<string, ProductFeedbackSubmission>()
    const s = svc(new Map(), rows)
    await s.submit({
      actor: m,
      parsed: {
        workspacePublicId: m.workspacePublicId,
        submissionType: "existing_feature_feedback",
        body: "y".repeat(25),
        sourceSurface: "global_help",
      },
    })
    const r = [...rows.values()][0]
    assert.equal(r.route, GENERAL_ENTRY_ROUTE)
  })

  it("sanitizes screenContext size", async () => {
    const m = member()
    const s = svc(new Map(), new Map())
    const big: Record<string, string> = {}
    for (let i = 0; i < 50; i += 1) big[`k${i}`] = "x".repeat(30)
    await assert.rejects(
      () =>
        s.submit({
          actor: m,
          parsed: {
            workspacePublicId: m.workspacePublicId,
            submissionType: "existing_feature_feedback",
            body: "y".repeat(25),
            sourceSurface: "global_help",
            screenContext: big,
          },
        }),
      (e: unknown) => (e as { code: string }).code === "invalid_screen_context",
    )
  })

  it("enforces uniqueness per user+idea", async () => {
    const m = member()
    const ideaId = randomUUID()
    const ideas = new Map([[ideaId, baseIdea(ideaId)]])
    const rows = new Map<string, ProductFeedbackSubmission>()
    const s = svc(ideas, rows)
    await s.submit({
      actor: m,
      parsed: {
        workspacePublicId: m.workspacePublicId,
        submissionType: "existing_feature_feedback",
        body: "y".repeat(25),
        ideaPublicId: ideaId,
        sourceSurface: "idea_page",
      },
    })
    await assert.rejects(
      () =>
        s.submit({
          actor: m,
          parsed: {
            workspacePublicId: m.workspacePublicId,
            submissionType: "existing_feature_feedback",
            body: "z".repeat(25),
            ideaPublicId: ideaId,
            sourceSurface: "idea_page",
          },
        }),
      (e: unknown) => (e as { code: string }).code === "duplicate_idea_submission",
    )
  })

  it("lists with filter q", async () => {
    const m = member()
    const ideaId = randomUUID()
    const ideas = new Map([[ideaId, baseIdea(ideaId)]])
    const rows = new Map<string, ProductFeedbackSubmission>()
    const s = svc(ideas, rows)
    await s.submit({
      actor: m,
      parsed: {
        workspacePublicId: m.workspacePublicId,
        submissionType: "new_feature_suggestion",
        title: "Hola motor",
        body: "cuerpo del mensaje largo suficiente xx",
        sourceSurface: "main_menu",
      },
    })
    const listed = await s.listAdmin(operatorSession(), {
      textSearch: "motor",
      limit: 25,
      offset: 0,
    })
    assert.equal(listed.total, 1)
  })

  it("patch duplicate requires valid duplicateOf", async () => {
    const m = member()
    const rows = new Map<string, ProductFeedbackSubmission>()
    const sid1 = randomUUID()
    const sid2 = randomUUID()
    const t = now
    rows.set(sid1, {
      submissionPublicId: sid1,
      workspacePublicId: m.workspacePublicId,
      userPublicId: m.userPublicId,
      submitterDisplayName: "U",
      submissionType: "existing_feature_feedback",
      title: null,
      body: "a".repeat(22),
      ideaPublicId: null,
      moduleKey: null,
      route: GENERAL_ENTRY_ROUTE,
      screenContext: null,
      projectPublicId: null,
      operationalApproach: null,
      sourceSurface: "x",
      reaction: null,
      status: "new",
      internalTags: [],
      internalNotes: null,
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: t,
      updatedAt: t,
    })
    rows.set(sid2, {
      ...rows.get(sid1)!,
      submissionPublicId: sid2,
      body: "b".repeat(22),
    })
    const s = svc(new Map(), rows)
    await s.patchAdmin(operatorSession(), sid1, {
      status: "duplicate",
      duplicateOfSubmissionPublicId: sid2,
    })
    assert.equal(rows.get(sid1)!.duplicateOfSubmissionPublicId, sid2)
    await assert.rejects(
      () => s.patchAdmin(operatorSession(), sid1, { status: "duplicate", duplicateOfSubmissionPublicId: randomUUID() }),
      (e: unknown) => (e as { code: string }).code === "duplicate_target_not_found",
    )
  })

  it("patch actionable forbidden for wrong role path", async () => {
    /** actionable solo operator/super: auditor no puede PATCH */
    const m = member()
    const sid = randomUUID()
    const t = now
    const row: ProductFeedbackSubmission = {
      submissionPublicId: sid,
      workspacePublicId: m.workspacePublicId,
      userPublicId: m.userPublicId,
      submitterDisplayName: "U",
      submissionType: "existing_feature_feedback",
      title: null,
      body: "c".repeat(22),
      ideaPublicId: null,
      moduleKey: null,
      route: GENERAL_ENTRY_ROUTE,
      screenContext: null,
      projectPublicId: null,
      operationalApproach: null,
      sourceSurface: "x",
      reaction: null,
      status: "new",
      internalTags: [],
      internalNotes: null,
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: t,
      updatedAt: t,
    }
    const rows = new Map([[sid, row]])
    const s = svc(new Map(), rows)
    await assert.rejects(
      () => s.patchAdmin(auditorSession(), sid, { status: "actionable" }),
      (e: unknown) => (e as { code: string }).code === "forbidden",
    )
    await s.patchAdmin(operatorSession(), sid, { status: "actionable" })
    assert.equal(rows.get(sid)!.status, "actionable")
    await s.patchAdmin(superSession(), sid, { status: "useful" })
    await s.patchAdmin(superSession(), sid, { status: "actionable" })
  })

  it("auditor detail omits internalNotes", async () => {
    const m = member()
    const sid = randomUUID()
    const t = now
    const row: ProductFeedbackSubmission = {
      submissionPublicId: sid,
      workspacePublicId: m.workspacePublicId,
      userPublicId: m.userPublicId,
      submitterDisplayName: "U",
      submissionType: "existing_feature_feedback",
      title: null,
      body: "d".repeat(22),
      ideaPublicId: null,
      moduleKey: null,
      route: GENERAL_ENTRY_ROUTE,
      screenContext: null,
      projectPublicId: null,
      operationalApproach: null,
      sourceSurface: "x",
      reaction: null,
      status: "new",
      internalTags: [],
      internalNotes: "secreto",
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: t,
      updatedAt: t,
    }
    const rows = new Map([[sid, row]])
    const s = svc(new Map(), rows)
    const aud = await s.getAdminDetail(auditorSession(), sid)
    assert.equal(aud.internalNotes, undefined)
    const op = await s.getAdminDetail(operatorSession(), sid)
    assert.equal(op.internalNotes, "secreto")
  })

  it("allows associating ideaPublicId in patch", async () => {
    const m = member()
    const ideaId = randomUUID()
    const ideas = new Map([[ideaId, baseIdea(ideaId)]])
    const sid = randomUUID()
    const t = now
    const row: ProductFeedbackSubmission = {
      submissionPublicId: sid,
      workspacePublicId: m.workspacePublicId,
      userPublicId: m.userPublicId,
      submitterDisplayName: "U",
      submissionType: "existing_feature_feedback",
      title: null,
      body: "e".repeat(22),
      ideaPublicId: null,
      moduleKey: null,
      route: GENERAL_ENTRY_ROUTE,
      screenContext: null,
      projectPublicId: null,
      operationalApproach: null,
      sourceSurface: "x",
      reaction: null,
      status: "new",
      internalTags: [],
      internalNotes: null,
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: t,
      updatedAt: t,
    }
    const rows = new Map([[sid, row]])
    const s = svc(ideas, rows)
    await s.patchAdmin(operatorSession(), sid, { ideaPublicId: ideaId })
    assert.equal(rows.get(sid)!.ideaPublicId, ideaId)
  })

  it("rejects invalid misroutingCategory for non-misrouted status", async () => {
    const m = member()
    const sid = randomUUID()
    const t = now
    const baseRow: ProductFeedbackSubmission = {
      submissionPublicId: sid,
      workspacePublicId: m.workspacePublicId,
      userPublicId: m.userPublicId,
      submitterDisplayName: "U",
      submissionType: "existing_feature_feedback",
      title: null,
      body: "f".repeat(22),
      ideaPublicId: null,
      moduleKey: null,
      route: GENERAL_ENTRY_ROUTE,
      screenContext: null,
      projectPublicId: null,
      operationalApproach: null,
      sourceSurface: "x",
      reaction: null,
      status: "new",
      internalTags: [],
      internalNotes: null,
      misroutingCategory: null,
      duplicateOfSubmissionPublicId: null,
      reviewDisposition: null,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      createdAt: t,
      updatedAt: t,
    }
    const rows = new Map([[sid, baseRow]])
    const s = svc(new Map(), rows)
    await assert.rejects(
      () => s.patchAdmin(operatorSession(), sid, { misroutingCategory: "billing" }),
      (e: unknown) => (e as { code: string }).code === "invalid_misrouting_category",
    )
  })
})
