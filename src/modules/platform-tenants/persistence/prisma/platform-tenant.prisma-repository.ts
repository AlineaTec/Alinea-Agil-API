import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { PlatformTenantState } from "../../domain/platform-tenant.entity.js"
import type { PlatformTenantRepository } from "../platform-tenant.repository.js"

function rowToState(row: {
  platform_tenant_id: string
  workspace_public_id: string
  status: string
  created_at: Date
  updated_at: Date
}): PlatformTenantState {
  return {
    platformTenantId: row.platform_tenant_id,
    workspacePublicId: row.workspace_public_id,
    status: row.status as PlatformTenantState["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PlatformTenantPrismaRepository implements PlatformTenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insert(state: PlatformTenantState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`platform_tenant_workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.platformTenant.create({
      data: {
        platform_tenant_id: state.platformTenantId,
        workspace_id: workspaceId,
        workspace_public_id: state.workspacePublicId,
        status: state.status,
        created_at: state.createdAt,
        updated_at: state.updatedAt,
      },
    })
  }

  async save(state: PlatformTenantState, _session?: ClientSession): Promise<void> {
    await this.prisma.platformTenant.update({
      where: { platform_tenant_id: state.platformTenantId },
      data: { status: state.status, updated_at: state.updatedAt },
    })
  }

  async findByPlatformTenantId(
    platformTenantId: string,
    _session?: ClientSession,
  ): Promise<PlatformTenantState | null> {
    const row = await this.prisma.platformTenant.findUnique({
      where: { platform_tenant_id: platformTenantId },
    })
    return row ? rowToState(row) : null
  }

  async findByWorkspacePublicId(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<PlatformTenantState | null> {
    const row = await this.prisma.platformTenant.findUnique({
      where: { workspace_public_id: workspacePublicId },
    })
    return row ? rowToState(row) : null
  }

  async findByWorkspacePublicIds(
    workspacePublicIds: string[],
    _session?: ClientSession,
  ): Promise<Map<string, PlatformTenantState>> {
    if (workspacePublicIds.length === 0) return new Map()
    const rows = await this.prisma.platformTenant.findMany({
      where: { workspace_public_id: { in: workspacePublicIds } },
    })
    const m = new Map<string, PlatformTenantState>()
    for (const row of rows) {
      m.set(row.workspace_public_id, rowToState(row))
    }
    return m
  }

  async ensureForWorkspacePublicIds(
    workspacePublicIds: string[],
    _session?: ClientSession,
  ): Promise<Map<string, PlatformTenantState>> {
    const existing = await this.findByWorkspacePublicIds(workspacePublicIds)
    const missing = workspacePublicIds.filter((id) => !existing.has(id))
    if (missing.length > 0) {
      const now = new Date()
      const rows: Array<{
        platform_tenant_id: string
        workspace_id: string
        workspace_public_id: string
        status: string
        created_at: Date
        updated_at: Date
      }> = []
      for (const workspacePublicId of missing) {
        const workspaceId = await resolveWorkspaceId(this.prisma, workspacePublicId)
        if (!workspaceId) continue
        rows.push({
          platform_tenant_id: randomUUID(),
          workspace_id: workspaceId,
          workspace_public_id: workspacePublicId,
          status: "active",
          created_at: now,
          updated_at: now,
        })
      }
      if (rows.length > 0) {
        await this.prisma.platformTenant.createMany({
          data: rows,
          skipDuplicates: true,
        })
      }
      const created = await this.findByWorkspacePublicIds(missing)
      for (const [k, v] of created) existing.set(k, v)
    }
    return existing
  }
}
