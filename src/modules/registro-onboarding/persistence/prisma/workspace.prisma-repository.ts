import type { PrismaClient } from "@prisma/client"
import type {
  CreateWorkspaceInput,
  WorkspaceRepository,
  WorkspaceState,
} from "../workspace.repository.js"
import { createWorkspaceToPrisma, workspaceFromPrisma } from "./workspace.prisma-mapper.js"

/** PostgreSQL para `workspaces`.  */
export class WorkspacePrismaRepository implements WorkspaceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateWorkspaceInput): Promise<WorkspaceState> {
    const row = await this.prisma.workspace.create({ data: createWorkspaceToPrisma(input) })
    return workspaceFromPrisma(row)
  }

  async findByWorkspacePublicId(workspacePublicId: string): Promise<WorkspaceState | null> {
    const row = await this.prisma.workspace.findUnique({ where: { public_id: workspacePublicId } })
    return row ? workspaceFromPrisma(row) : null
  }

  async findBySlug(slug: string): Promise<WorkspaceState | null> {
    const row = await this.prisma.workspace.findUnique({ where: { slug } })
    return row ? workspaceFromPrisma(row) : null
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.prisma.workspace.count({ where: { slug } })
    return count > 0
  }
}
