import type { PrismaClient } from "@prisma/client"
import { resolveFeedbackWorkspaceProjectIds } from "../../../../infrastructure/postgres/feedback-scope.js"
import type { ProductIdeaFeedbackEntry } from "../../domain/product-idea-feedback-entry.js"
import type {
  AdminListFilter,
  ProductIdeaFeedbackEntryEntryRepository,
  ReviewMetadataPatch,
} from "../product-idea-feedback-entry.repository.js"

function rowToEntry(row: {
  public_id: string
  idea_public_id: string
  workspace_public_id: string
  project_public_id: string | null
  user_public_id: string
  submitter_display_name: string
  reaction: string
  liked_what: string
  could_improve_what: string
  additional_comment: string | null
  source_surface: string
  review_status: string
  reviewed_by_platform_user_id: string | null
  reviewed_at: Date | null
  internal_tags: string[]
  internal_notes: string | null
  created_at: Date
  updated_at: Date
}): ProductIdeaFeedbackEntry {
  return {
    feedbackPublicId: row.public_id,
    ideaPublicId: row.idea_public_id,
    workspacePublicId: row.workspace_public_id,
    projectPublicId: row.project_public_id,
    userPublicId: row.user_public_id,
    submitterDisplayName: row.submitter_display_name,
    reaction: row.reaction as ProductIdeaFeedbackEntry["reaction"],
    likedWhat: row.liked_what,
    couldImproveWhat: row.could_improve_what,
    additionalComment: row.additional_comment,
    sourceSurface: row.source_surface as ProductIdeaFeedbackEntry["sourceSurface"],
    reviewStatus: row.review_status as ProductIdeaFeedbackEntry["reviewStatus"],
    reviewedByPlatformUserId: row.reviewed_by_platform_user_id,
    reviewedAt: row.reviewed_at,
    internalTags: row.internal_tags ?? [],
    internalNotes: row.internal_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ProductIdeaFeedbackEntryPrismaRepository implements ProductIdeaFeedbackEntryEntryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: ProductIdeaFeedbackEntry): Promise<void> {
    const scope = await resolveFeedbackWorkspaceProjectIds(
      this.prisma,
      row.workspacePublicId,
      row.projectPublicId,
    )
    if (!scope) throw new Error(`feedback_workspace_not_found:${row.workspacePublicId}`)
    await this.prisma.productIdeaFeedbackEntry.create({
      data: {
        public_id: row.feedbackPublicId,
        idea_public_id: row.ideaPublicId,
        workspace_id: scope.workspaceId,
        workspace_public_id: row.workspacePublicId,
        project_id: scope.projectId,
        project_public_id: row.projectPublicId,
        user_public_id: row.userPublicId,
        submitter_display_name: row.submitterDisplayName,
        reaction: row.reaction,
        liked_what: row.likedWhat,
        could_improve_what: row.couldImproveWhat,
        additional_comment: row.additionalComment,
        source_surface: row.sourceSurface,
        review_status: row.reviewStatus,
        reviewed_by_platform_user_id: row.reviewedByPlatformUserId,
        reviewed_at: row.reviewedAt,
        internal_tags: row.internalTags,
        internal_notes: row.internalNotes,
      },
    })
  }

  async findByPublicId(feedbackPublicId: string): Promise<ProductIdeaFeedbackEntry | null> {
    const row = await this.prisma.productIdeaFeedbackEntry.findUnique({
      where: { public_id: feedbackPublicId },
    })
    return row ? rowToEntry(row) : null
  }

  async findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductIdeaFeedbackEntry | null> {
    const row = await this.prisma.productIdeaFeedbackEntry.findFirst({
      where: { workspace_public_id: workspacePublicId, idea_public_id: ideaPublicId, user_public_id: userPublicId },
    })
    return row ? rowToEntry(row) : null
  }

  async listAdmin(filter: AdminListFilter): Promise<{ rows: ProductIdeaFeedbackEntry[]; total: number }> {
    const where = {
      ...(filter.reviewStatus ? { review_status: filter.reviewStatus } : {}),
      ...(filter.ideaPublicId ? { idea_public_id: filter.ideaPublicId } : {}),
      ...(filter.workspacePublicId ? { workspace_public_id: filter.workspacePublicId } : {}),
      ...(filter.fromInclusive || filter.toInclusive
        ? {
            created_at: {
              ...(filter.fromInclusive ? { gte: filter.fromInclusive } : {}),
              ...(filter.toInclusive ? { lte: filter.toInclusive } : {}),
            },
          }
        : {}),
    }
    const [total, rows] = await Promise.all([
      this.prisma.productIdeaFeedbackEntry.count({ where }),
      this.prisma.productIdeaFeedbackEntry.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: filter.offset,
        take: filter.limit,
      }),
    ])
    return { total, rows: rows.map(rowToEntry) }
  }

  async updateReviewMetadata(
    feedbackPublicId: string,
    patch: ReviewMetadataPatch,
  ): Promise<ProductIdeaFeedbackEntry | null> {
    try {
      const row = await this.prisma.productIdeaFeedbackEntry.update({
        where: { public_id: feedbackPublicId },
        data: {
          ...(patch.reviewStatus !== undefined ? { review_status: patch.reviewStatus } : {}),
          ...(patch.internalTags !== undefined ? { internal_tags: patch.internalTags } : {}),
          ...(patch.internalNotes !== undefined ? { internal_notes: patch.internalNotes } : {}),
          ...(patch.reviewedByPlatformUserId !== undefined
            ? { reviewed_by_platform_user_id: patch.reviewedByPlatformUserId }
            : {}),
          ...(patch.reviewedAt !== undefined ? { reviewed_at: patch.reviewedAt } : {}),
        },
      })
      return rowToEntry(row)
    } catch {
      return null
    }
  }
}
