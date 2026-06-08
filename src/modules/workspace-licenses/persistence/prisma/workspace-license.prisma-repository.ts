import type { PrismaClient } from "@prisma/client"
import type { PersistenceSession as ClientSession } from "../../../../infrastructure/persistence/persistence-session.js"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspaceLicenseState } from "../../domain/workspace-license-state.js"
import type { WorkspaceLicenseRepository } from "../workspace-license.repository.js"
import { workspaceLicenseFromPrisma, workspaceLicenseToPrisma } from "./workspace-license.prisma-mapper.js"

export class WorkspaceLicensePrismaRepository implements WorkspaceLicenseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByWorkspacePublicId(
    workspacePublicId: string,
    _session?: ClientSession,
  ): Promise<WorkspaceLicenseState | null> {
    const row = await this.prisma.workspaceLicense.findUnique({
      where: { workspace_public_id: workspacePublicId },
    })
    return row ? workspaceLicenseFromPrisma(row) : null
  }

  async findManyByWorkspacePublicIds(
    workspacePublicIds: string[],
    _session?: ClientSession,
  ): Promise<Map<string, WorkspaceLicenseState>> {
    const map = new Map<string, WorkspaceLicenseState>()
    if (workspacePublicIds.length === 0) return map
    const rows = await this.prisma.workspaceLicense.findMany({
      where: { workspace_public_id: { in: workspacePublicIds } },
    })
    for (const row of rows) {
      map.set(row.workspace_public_id, workspaceLicenseFromPrisma(row))
    }
    return map
  }

  async insertInitial(state: WorkspaceLicenseState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    await this.prisma.workspaceLicense.create({
      data: workspaceLicenseToPrisma(state, workspaceId),
    })
  }

  async replace(state: WorkspaceLicenseState, _session?: ClientSession): Promise<void> {
    const workspaceId = await resolveWorkspaceId(this.prisma, state.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${state.workspacePublicId}`)
    const res = await this.prisma.workspaceLicense.updateMany({
      where: { workspace_public_id: state.workspacePublicId },
      data: workspaceLicenseToPrisma(state, workspaceId),
    })
    if (res.count === 0) throw new Error("workspace_license_not_found")
  }
}
