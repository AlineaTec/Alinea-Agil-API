import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@prisma/client"
import { PlatformTenantPrismaRepository } from "../persistence/prisma/platform-tenant.prisma-repository.js"

export type RegisterPlatformTenantHook = (workspacePublicId: string) => Promise<void>

/** Postgres: inserta `platform_tenants` tras commit del workspace (hook post-transacción). */
export async function registerPlatformTenantForNewWorkspacePrisma(
  prisma: PrismaClient,
  workspacePublicId: string,
): Promise<void> {
  const now = new Date()
  const repo = new PlatformTenantPrismaRepository(prisma)
  await repo.insert({
    platformTenantId: randomUUID(),
    workspacePublicId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  })
}

export function createRegisterPlatformTenantHook(prisma: PrismaClient): RegisterPlatformTenantHook {
  return (workspacePublicId) => registerPlatformTenantForNewWorkspacePrisma(prisma, workspacePublicId)
}
