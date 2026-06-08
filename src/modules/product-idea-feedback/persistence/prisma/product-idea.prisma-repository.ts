import type { PrismaClient } from "@prisma/client"
import type { ProductIdea } from "../../domain/product-idea.js"
import type { ProductIdeaListFilter, ProductIdeaPatch, ProductIdeaRepository } from "../product-idea.repository.js"

function rowToEntity(row: {
  public_id: string
  title: string
  summary: string
  description: string | null
  area: string
  status: string
  is_feedback_enabled: boolean
  created_at: Date
  updated_at: Date
}): ProductIdea {
  return {
    ideaPublicId: row.public_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    area: row.area,
    status: row.status as ProductIdea["status"],
    isFeedbackEnabled: row.is_feedback_enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ProductIdeaPrismaRepository implements ProductIdeaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPublicId(ideaPublicId: string): Promise<ProductIdea | null> {
    const row = await this.prisma.productIdea.findUnique({
      where: { public_id: ideaPublicId },
    })
    return row ? rowToEntity(row) : null
  }

  async list(filter: ProductIdeaListFilter): Promise<ProductIdea[]> {
    const rows = await this.prisma.productIdea.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.isFeedbackEnabled !== undefined
          ? { is_feedback_enabled: filter.isFeedbackEnabled }
          : {}),
      },
      orderBy: { updated_at: "desc" },
      skip: filter.offset,
      take: filter.limit,
    })
    return rows.map(rowToEntity)
  }

  async countList(filter: Omit<ProductIdeaListFilter, "limit" | "offset">): Promise<number> {
    return this.prisma.productIdea.count({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.isFeedbackEnabled !== undefined
          ? { is_feedback_enabled: filter.isFeedbackEnabled }
          : {}),
      },
    })
  }

  async insert(idea: ProductIdea): Promise<void> {
    await this.prisma.productIdea.create({
      data: {
        public_id: idea.ideaPublicId,
        title: idea.title,
        summary: idea.summary,
        description: idea.description,
        area: idea.area,
        status: idea.status,
        is_feedback_enabled: idea.isFeedbackEnabled,
      },
    })
  }

  async updateByPublicId(ideaPublicId: string, patch: ProductIdeaPatch): Promise<ProductIdea | null> {
    try {
      const row = await this.prisma.productIdea.update({
        where: { public_id: ideaPublicId },
        data: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.area !== undefined ? { area: patch.area } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.isFeedbackEnabled !== undefined
            ? { is_feedback_enabled: patch.isFeedbackEnabled }
            : {}),
        },
      })
      return rowToEntity(row)
    } catch {
      return null
    }
  }
}
