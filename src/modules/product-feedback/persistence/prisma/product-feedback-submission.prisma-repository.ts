import type { Prisma } from "@prisma/client"
import type { PrismaClient } from "@prisma/client"
import { resolveFeedbackWorkspaceProjectIds } from "../../../../infrastructure/postgres/feedback-scope.js"
import type { ProductFeedbackMisroutingCategory } from "../../domain/product-feedback-submission.js"
import type { ProductFeedbackSubmission } from "../../domain/product-feedback-submission.js"
import type {
  PlatformSubmissionListFilter,
  ProductFeedbackSubmissionRepository,
  SubmissionReviewPatch,
} from "../product-feedback-submission.repository.js"

function rowToSubmission(row: {
  public_id: string
  workspace_public_id: string
  user_public_id: string
  submitter_display_name: string
  submission_type: string
  title: string | null
  body: string
  idea_public_id: string | null
  module_key: string | null
  route: string
  screen_context: Prisma.JsonValue | null
  project_public_id: string | null
  operational_approach: string | null
  source_surface: string
  reaction: string | null
  status: string
  internal_tags: string[]
  internal_notes: string | null
  misrouting_category: string | null
  duplicate_of_submission_public_id: string | null
  review_disposition: string | null
  reviewed_by_platform_user_id: string | null
  reviewed_at: Date | null
  created_at: Date
  updated_at: Date
}): ProductFeedbackSubmission {
  return {
    submissionPublicId: row.public_id,
    workspacePublicId: row.workspace_public_id,
    userPublicId: row.user_public_id,
    submitterDisplayName: row.submitter_display_name,
    submissionType: row.submission_type as ProductFeedbackSubmission["submissionType"],
    title: row.title,
    body: row.body,
    ideaPublicId: row.idea_public_id,
    moduleKey: row.module_key,
    route: row.route,
    screenContext: row.screen_context as Record<string, unknown> | null,
    projectPublicId: row.project_public_id,
    operationalApproach: row.operational_approach,
    sourceSurface: row.source_surface,
    reaction: row.reaction,
    status: row.status as ProductFeedbackSubmission["status"],
    internalTags: row.internal_tags ?? [],
    internalNotes: row.internal_notes,
    misroutingCategory: (row.misrouting_category as ProductFeedbackMisroutingCategory | null) ?? null,
    duplicateOfSubmissionPublicId: row.duplicate_of_submission_public_id,
    reviewDisposition: row.review_disposition,
    reviewedByPlatformUserId: row.reviewed_by_platform_user_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildPlatformWhere(filter: PlatformSubmissionListFilter): Prisma.ProductFeedbackSubmissionWhereInput {
  const where: Prisma.ProductFeedbackSubmissionWhereInput = {}
  if (filter.submissionType) where.submission_type = filter.submissionType
  if (filter.status) where.status = filter.status
  if (filter.workspacePublicId) where.workspace_public_id = filter.workspacePublicId
  if (filter.moduleKey) where.module_key = filter.moduleKey
  if (filter.projectPublicId) where.project_public_id = filter.projectPublicId
  if (filter.ideaPublicId) where.idea_public_id = filter.ideaPublicId
  if (filter.misroutingCategory) where.misrouting_category = filter.misroutingCategory
  if (filter.fromInclusive || filter.toInclusive) {
    where.created_at = {
      ...(filter.fromInclusive ? { gte: filter.fromInclusive } : {}),
      ...(filter.toInclusive ? { lte: filter.toInclusive } : {}),
    }
  }
  if (filter.textSearch?.trim()) {
    const t = filter.textSearch.trim()
    where.OR = [
      { body: { contains: t, mode: "insensitive" } },
      { title: { contains: t, mode: "insensitive" } },
    ]
  }
  return where
}

export class ProductFeedbackSubmissionPrismaRepository implements ProductFeedbackSubmissionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(row: ProductFeedbackSubmission): Promise<void> {
    const scope = await resolveFeedbackWorkspaceProjectIds(
      this.prisma,
      row.workspacePublicId,
      row.projectPublicId,
    )
    if (!scope) throw new Error(`feedback_workspace_not_found:${row.workspacePublicId}`)
    await this.prisma.productFeedbackSubmission.create({
      data: {
        public_id: row.submissionPublicId,
        workspace_id: scope.workspaceId,
        workspace_public_id: row.workspacePublicId,
        user_public_id: row.userPublicId,
        submitter_display_name: row.submitterDisplayName,
        submission_type: row.submissionType,
        title: row.title,
        body: row.body,
        idea_public_id: row.ideaPublicId,
        module_key: row.moduleKey,
        route: row.route,
        screen_context: row.screenContext as Prisma.InputJsonValue | undefined,
        project_id: scope.projectId,
        project_public_id: row.projectPublicId,
        operational_approach: row.operationalApproach,
        source_surface: row.sourceSurface,
        reaction: row.reaction,
        status: row.status,
        internal_tags: row.internalTags,
        internal_notes: row.internalNotes,
        misrouting_category: row.misroutingCategory,
        duplicate_of_submission_public_id: row.duplicateOfSubmissionPublicId,
        review_disposition: row.reviewDisposition,
        reviewed_by_platform_user_id: row.reviewedByPlatformUserId,
        reviewed_at: row.reviewedAt,
      },
    })
  }

  async findByPublicId(submissionPublicId: string): Promise<ProductFeedbackSubmission | null> {
    const row = await this.prisma.productFeedbackSubmission.findUnique({
      where: { public_id: submissionPublicId },
    })
    return row ? rowToSubmission(row) : null
  }

  async findByWorkspaceIdeaUser(
    workspacePublicId: string,
    ideaPublicId: string,
    userPublicId: string,
  ): Promise<ProductFeedbackSubmission | null> {
    const row = await this.prisma.productFeedbackSubmission.findFirst({
      where: { workspace_public_id: workspacePublicId, idea_public_id: ideaPublicId, user_public_id: userPublicId },
    })
    return row ? rowToSubmission(row) : null
  }

  async listPlatform(filter: PlatformSubmissionListFilter): Promise<{
    rows: ProductFeedbackSubmission[]
    total: number
  }> {
    const where = buildPlatformWhere(filter)
    const [total, rows] = await Promise.all([
      this.prisma.productFeedbackSubmission.count({ where }),
      this.prisma.productFeedbackSubmission.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: filter.offset,
        take: filter.limit,
      }),
    ])
    return { total, rows: rows.map(rowToSubmission) }
  }

  async updateReviewAndAssociations(
    submissionPublicId: string,
    patch: SubmissionReviewPatch,
  ): Promise<ProductFeedbackSubmission | null> {
    try {
      const row = await this.prisma.productFeedbackSubmission.update({
        where: { public_id: submissionPublicId },
        data: {
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.internalTags !== undefined ? { internal_tags: patch.internalTags } : {}),
          ...(patch.internalNotes !== undefined ? { internal_notes: patch.internalNotes } : {}),
          ...(patch.misroutingCategory !== undefined ? { misrouting_category: patch.misroutingCategory } : {}),
          ...(patch.duplicateOfSubmissionPublicId !== undefined
            ? { duplicate_of_submission_public_id: patch.duplicateOfSubmissionPublicId }
            : {}),
          ...(patch.ideaPublicId !== undefined ? { idea_public_id: patch.ideaPublicId } : {}),
          ...(patch.reviewDisposition !== undefined ? { review_disposition: patch.reviewDisposition } : {}),
          ...(patch.reviewedByPlatformUserId !== undefined
            ? { reviewed_by_platform_user_id: patch.reviewedByPlatformUserId }
            : {}),
          ...(patch.reviewedAt !== undefined ? { reviewed_at: patch.reviewedAt } : {}),
        },
      })
      return rowToSubmission(row)
    } catch {
      return null
    }
  }
}
