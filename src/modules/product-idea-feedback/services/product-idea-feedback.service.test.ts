import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { ProductIdea } from "../domain/product-idea.js"
import type { ProductIdeaFeedbackEntry, ProductIdeaFeedbackEntryReviewStatus } from "../domain/product-idea-feedback-entry.js"
import type { ProductIdeaFeedbackEntryAuditAppendInput } from "../persistence/product-idea-feedback-audit.repository.js"
import type { ProductIdeaPatch, ProductIdeaRepository } from "../persistence/product-idea.repository.js"
import type {
  AdminListFilter,
  ProductIdeaFeedbackEntryEntryRepository,
  ReviewMetadataPatch,
} from "../persistence/product-idea-feedback-entry.repository.js"
import type { WorkspaceRuntimeProjectLookup } from "../persistence/workspace-runtime-project-lookup.js"
import { ProductIdeaFeedbackEntryService } from "./product-idea-feedback.service.js"

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

function superSession(): PlatformSessionContext {
  return { platformUserId: randomUUID(), email: "p@test.com", role: "platform_super_admin" }
}
function auditorSession(): PlatformSessionContext {
  return { platformUserId: randomUUID(), email: "a@test.com", role: "platform_auditor" }
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
    const next: ProductIdea = {
      ...cur,
      ...patch,
      updatedAt: new Date(),
    }
    this.ideas.set(ideaPublicId, next)
    return { ...next }
  }
}

class MemoryFeedback implements ProductIdeaFeedbackEntryEntryRepository {
  constructor(public rows: Map<string, ProductIdeaFeedbackEntry>) {}
  async insert(row: ProductIdeaFeedbackEntry): Promise<void> {
    this.rows.set(row.feedbackPublicId, { ...row })
  }
  async findByPublicId(id: string): Promise<ProductIdeaFeedbackEntry | null> {
    return this.rows.get(id) ? { ...this.rows.get(id)! } : null
  }
  async findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductIdeaFeedbackEntry | null> {
    for (const r of this.rows.values()) {
      if (r.workspacePublicId === workspacePublicId && r.ideaPublicId === ideaPublicId && r.userPublicId === userPublicId) {
        return { ...r }
      }
    }
    return null
  }
  async listAdmin(filter: AdminListFilter): Promise<{ rows: ProductIdeaFeedbackEntry[]; total: number }> {
    let list = [...this.rows.values()]
    if (filter.reviewStatus) list = list.filter((r) => r.reviewStatus === filter.reviewStatus)
    if (filter.ideaPublicId) list = list.filter((r) => r.ideaPublicId === filter.ideaPublicId)
    if (filter.workspacePublicId) list = list.filter((r) => r.workspacePublicId === filter.workspacePublicId)
    if (filter.fromInclusive) list = list.filter((r) => r.createdAt >= filter.fromInclusive!)
    if (filter.toInclusive) list = list.filter((r) => r.createdAt <= filter.toInclusive!)
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    const total = list.length
    return {
      total,
      rows: list.slice(filter.offset, filter.offset + filter.limit).map((r) => ({ ...r })),
    }
  }
  async updateReviewMetadata(
    feedbackPublicId: string,
    patch: ReviewMetadataPatch,
  ): Promise<ProductIdeaFeedbackEntry | null> {
    const cur = this.rows.get(feedbackPublicId)
    if (!cur) return null
    const next: ProductIdeaFeedbackEntry = {
      ...cur,
      reviewStatus: patch.reviewStatus ?? cur.reviewStatus,
      internalTags: patch.internalTags ?? cur.internalTags,
      internalNotes: patch.internalNotes !== undefined ? patch.internalNotes : cur.internalNotes,
      reviewedByPlatformUserId: patch.reviewedByPlatformUserId,
      reviewedAt: patch.reviewedAt,
      updatedAt: new Date(),
    }
    this.rows.set(feedbackPublicId, next)
    return { ...next }
  }
}

class MemoryAudit {
  events: ProductIdeaFeedbackEntryAuditAppendInput[] = []
  async append(e: ProductIdeaFeedbackEntryAuditAppendInput): Promise<void> {
    this.events.push(e)
  }
}

function publishedIdea(over: Partial<ProductIdea> = {}): ProductIdea {
  const now = new Date()
  return {
    ideaPublicId: randomUUID(),
    title: "Idea",
    summary: "Sum",
    description: null,
    area: "reporting",
    status: "published",
    isFeedbackEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

function makeService(deps: {
  ideas: MemoryIdeas
  feedback: MemoryFeedback
  audit: MemoryAudit
  projects: Set<string>
}) {
  const lookup: WorkspaceRuntimeProjectLookup = {
    async existsInWorkspace(ws, p) {
      return deps.projects.has(`${ws}:${p}`)
    },
  }
  return new ProductIdeaFeedbackEntryService(deps.ideas, deps.feedback, deps.audit, lookup)
}

describe("ProductIdeaFeedbackEntryService", () => {
  it("envía feedback válido y audita creación", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const feedback = new MemoryFeedback(new Map())
    const audit = new MemoryAudit()
    const m = member()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    const out = await svc.submit({
      actor: m,
      workspacePublicId: m.workspacePublicId,
      ideaPublicId: idea.ideaPublicId,
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "idea_page",
      projectPublicId: null,
    })
    assert.ok(out.feedbackPublicId)
    assert.equal(audit.events.length, 1)
    assert.equal(audit.events[0].kind, "feedback_created")
  })

  it("lista solo ideas publicadas con feedback habilitado", async () => {
    const publishedOk = publishedIdea({ title: "Visible" })
    const draft = publishedIdea({ status: "draft", title: "Borrador" })
    const noFb = publishedIdea({ isFeedbackEnabled: false, title: "Sin FB" })
    const ideas = new MemoryIdeas(
      new Map([
        [publishedOk.ideaPublicId, publishedOk],
        [draft.ideaPublicId, draft],
        [noFb.ideaPublicId, noFb],
      ]),
    )
    const svc = makeService({
      ideas,
      feedback: new MemoryFeedback(new Map()),
      audit: new MemoryAudit(),
      projects: new Set(),
    })
    const out = await svc.listIdeasForWorkspace(member())
    assert.equal(out.items.length, 1)
    assert.equal(out.items[0].ideaPublicId, publishedOk.ideaPublicId)
    assert.equal(out.items[0].title, "Visible")
  })

  it("rechaza idea inexistente", async () => {
    const ideas = new MemoryIdeas(new Map())
    const svc = makeService({
      ideas,
      feedback: new MemoryFeedback(new Map()),
      audit: new MemoryAudit(),
      projects: new Set(),
    })
    const m = member()
    await assert.rejects(
      () =>
        svc.submit({
          actor: m,
          workspacePublicId: m.workspacePublicId,
          ideaPublicId: randomUUID(),
          reaction: "like",
          likedWhat: "x".repeat(20),
          couldImproveWhat: "",
          additionalComment: null,
          sourceSurface: "other",
          projectPublicId: null,
        }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 404,
    )
  })

  it("rechaza idea sin feedback habilitado", async () => {
    const idea = publishedIdea({ isFeedbackEnabled: false })
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const svc = makeService({
      ideas,
      feedback: new MemoryFeedback(new Map()),
      audit: new MemoryAudit(),
      projects: new Set(),
    })
    const m = member()
    await assert.rejects(
      () =>
        svc.submit({
          actor: m,
          workspacePublicId: m.workspacePublicId,
          ideaPublicId: idea.ideaPublicId,
          reaction: "like",
          likedWhat: "x".repeat(20),
          couldImproveWhat: "",
          additionalComment: null,
          sourceSurface: "other",
          projectPublicId: null,
        }),
      (e: unknown) => (e as { code: string }).code === "feedback_disabled",
    )
  })

  it("rechaza idea no publicada (visibilidad workspace)", async () => {
    const idea = publishedIdea({ status: "internal" })
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const svc = makeService({
      ideas,
      feedback: new MemoryFeedback(new Map()),
      audit: new MemoryAudit(),
      projects: new Set(),
    })
    const m = member()
    await assert.rejects(
      () =>
        svc.submit({
          actor: m,
          workspacePublicId: m.workspacePublicId,
          ideaPublicId: idea.ideaPublicId,
          reaction: "like",
          likedWhat: "x".repeat(20),
          couldImproveWhat: "",
          additionalComment: null,
          sourceSurface: "other",
          projectPublicId: null,
        }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 404,
    )
  })

  it("rechaza miembro desactivado (submit policy)", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const svc = makeService({
      ideas,
      feedback: new MemoryFeedback(new Map()),
      audit: new MemoryAudit(),
      projects: new Set(),
    })
    const m = member({ status: "deactivated" })
    await assert.rejects(
      () =>
        svc.submit({
          actor: m,
          workspacePublicId: m.workspacePublicId,
          ideaPublicId: idea.ideaPublicId,
          reaction: "like",
          likedWhat: "x".repeat(20),
          couldImproveWhat: "",
          additionalComment: null,
          sourceSurface: "other",
          projectPublicId: null,
        }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 403,
    )
  })

  it("rechaza segundo envío (unicidad user+idea)", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const map = new Map<string, ProductIdeaFeedbackEntry>()
    const feedback = new MemoryFeedback(map)
    const audit = new MemoryAudit()
    const m = member()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    await svc.submit({
      actor: m,
      workspacePublicId: m.workspacePublicId,
      ideaPublicId: idea.ideaPublicId,
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      projectPublicId: null,
    })
    await assert.rejects(
      () =>
        svc.submit({
          actor: m,
          workspacePublicId: m.workspacePublicId,
          ideaPublicId: idea.ideaPublicId,
          reaction: "interested",
          likedWhat: "y".repeat(20),
          couldImproveWhat: "",
          additionalComment: null,
          sourceSurface: "other",
          projectPublicId: null,
        }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 409,
    )
  })

  it("listado y detalle admin", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId: randomUUID(),
      ideaPublicId: idea.ideaPublicId,
      workspacePublicId: randomUUID(),
      projectPublicId: null,
      userPublicId: randomUUID(),
      submitterDisplayName: "A",
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      reviewStatus: "new",
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }
    const feedback = new MemoryFeedback(new Map([[row.feedbackPublicId, row]]))
    const audit = new MemoryAudit()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    const list = await svc.listAdmin(superSession(), { limit: 10, offset: 0 })
    assert.equal(list.total, 1)
    const d = await svc.getAdminDetail(superSession(), row.feedbackPublicId)
    assert.equal((d as { userPublicId: string | null }).userPublicId, row.userPublicId)
  })

  it("auditor no recibe userPublicId en detalle", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId: randomUUID(),
      ideaPublicId: idea.ideaPublicId,
      workspacePublicId: randomUUID(),
      projectPublicId: null,
      userPublicId: randomUUID(),
      submitterDisplayName: "A",
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      reviewStatus: "new",
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }
    const feedback = new MemoryFeedback(new Map([[row.feedbackPublicId, row]]))
    const audit = new MemoryAudit()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    const d = await svc.getAdminDetail(auditorSession(), row.feedbackPublicId)
    assert.equal((d as { userPublicId: string | null }).userPublicId, null)
  })

  it("cambia estado a misrouted_support y audita", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId: randomUUID(),
      ideaPublicId: idea.ideaPublicId,
      workspacePublicId: randomUUID(),
      projectPublicId: null,
      userPublicId: randomUUID(),
      submitterDisplayName: "A",
      reaction: "unclear",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      reviewStatus: "new" as ProductIdeaFeedbackEntryReviewStatus,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }
    const feedback = new MemoryFeedback(new Map([[row.feedbackPublicId, row]]))
    const audit = new MemoryAudit()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    const sess = superSession()
    const n = audit.events.length
    await svc.patchAdmin(sess, row.feedbackPublicId, { reviewStatus: "misrouted_support" })
    const after = await svc.getAdminDetail(sess, row.feedbackPublicId)
    assert.equal((after as { reviewStatus: string }).reviewStatus, "misrouted_support")
    assert.ok(audit.events.length > n)
    assert.ok(audit.events.some((e) => e.kind === "admin_review_updated"))
  })

  it("operador / super admin: tags y notas", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId: randomUUID(),
      ideaPublicId: idea.ideaPublicId,
      workspacePublicId: randomUUID(),
      projectPublicId: null,
      userPublicId: randomUUID(),
      submitterDisplayName: "A",
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      reviewStatus: "new" as ProductIdeaFeedbackEntryReviewStatus,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }
    const feedback = new MemoryFeedback(new Map([[row.feedbackPublicId, row]]))
    const audit = new MemoryAudit()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    const sess = superSession()
    const out = await svc.patchAdmin(sess, row.feedbackPublicId, {
      internalTags: ["clarity"],
      internalNotes: "nota",
    })
    assert.ok((out as { internalTags: string[] }).internalTags.includes("clarity"))
  })

  it("auditor no puede mutar (policy)", async () => {
    const idea = publishedIdea()
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const now = new Date()
    const row: ProductIdeaFeedbackEntry = {
      feedbackPublicId: randomUUID(),
      ideaPublicId: idea.ideaPublicId,
      workspacePublicId: randomUUID(),
      projectPublicId: null,
      userPublicId: randomUUID(),
      submitterDisplayName: "A",
      reaction: "like",
      likedWhat: "x".repeat(20),
      couldImproveWhat: "",
      additionalComment: null,
      sourceSurface: "other",
      reviewStatus: "new" as ProductIdeaFeedbackEntryReviewStatus,
      reviewedByPlatformUserId: null,
      reviewedAt: null,
      internalTags: [],
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    }
    const feedback = new MemoryFeedback(new Map([[row.feedbackPublicId, row]]))
    const audit = new MemoryAudit()
    const svc = makeService({ ideas, feedback, audit, projects: new Set() })
    await assert.rejects(
      () => svc.patchAdmin(auditorSession(), row.feedbackPublicId, { reviewStatus: "reviewed" }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 403,
    )
  })

  it("crea idea de producto (plataforma, no auditor)", async () => {
    const ideas = new MemoryIdeas(new Map())
    const svc = makeService({ ideas, feedback: new MemoryFeedback(new Map()), audit: new MemoryAudit(), projects: new Set() })
    const out = await svc.createIdeaForPlatform(superSession(), {
      title: "Nueva",
      summary: "Resumen",
      description: "Detalle",
      area: "reporting",
      status: "draft",
      isFeedbackEnabled: true,
    })
    assert.equal(out.title, "Nueva")
    assert.equal(out.description, "Detalle")
    assert.equal(ideas.ideas.size, 1)
  })

  it("auditor de plataforma no puede crear idea", async () => {
    const ideas = new MemoryIdeas(new Map())
    const svc = makeService({ ideas, feedback: new MemoryFeedback(new Map()), audit: new MemoryAudit(), projects: new Set() })
    await assert.rejects(
      () =>
        svc.createIdeaForPlatform(auditorSession(), {
          title: "Nueva",
          summary: "Resumen",
          description: null,
          area: "reporting",
          status: "draft",
          isFeedbackEnabled: true,
        }),
      (e: unknown) => (e as { httpStatus: number }).httpStatus === 403,
    )
  })

  it("parchea título de idea (plataforma)", async () => {
    const idea = publishedIdea({ title: "Viejo" })
    const ideas = new MemoryIdeas(new Map([[idea.ideaPublicId, idea]]))
    const svc = makeService({ ideas, feedback: new MemoryFeedback(new Map()), audit: new MemoryAudit(), projects: new Set() })
    const out = await svc.patchIdeaForPlatform(superSession(), idea.ideaPublicId, { title: "Nuevo" })
    assert.equal(out.title, "Nuevo")
  })
})
