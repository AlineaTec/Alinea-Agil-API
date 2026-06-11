import type { Prisma, PrismaClient } from "@prisma/client"
import { normalizeWorkspaceModality } from "../../../registro-onboarding/domain/workspace-modality.js"
import type { WorkspaceModality } from "../../../registro-onboarding/domain/workspace-modality.js"
import type { WorkspaceCatalogRepository, WorkspaceCatalogRow } from "../workspace-catalog.repository.js"

function rowFromWorkspace(row: {
  public_id: string
  slug: string
  display_name: string
  modality: string
  billing_cadence: string | null
  created_at: Date
  updated_at: Date
}): WorkspaceCatalogRow {
  const modality: WorkspaceModality =
    normalizeWorkspaceModality(row.modality) ?? "individual"
  return {
    workspacePublicId: row.public_id,
    code: row.slug,
    displayName: row.display_name,
    modality,
    billingCadence: row.billing_cadence === "monthly" ? "monthly" : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class WorkspaceCatalogPrismaRepository implements WorkspaceCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(search?: string): Promise<WorkspaceCatalogRow[]> {
    const q = search?.trim()
    const where: Prisma.WorkspaceWhereInput =
      q && q.length > 0
        ? {
            OR: [
              { display_name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}
    const rows = await this.prisma.workspace.findMany({
      where,
      orderBy: { created_at: "desc" },
    })
    return rows.map(rowFromWorkspace)
  }

  async findByPublicId(workspacePublicId: string): Promise<WorkspaceCatalogRow | null> {
    const row = await this.prisma.workspace.findUnique({
      where: { public_id: workspacePublicId },
    })
    return row ? rowFromWorkspace(row) : null
  }
}
