import type { PrismaClient } from "@prisma/client"
import type { PlatformAuditQueryRepository } from "../../modules/platform-audit/persistence/platform-audit-query.repository.js"
import { PlatformAuditQueryPrismaRepository } from "../../modules/platform-audit/persistence/prisma/platform-audit-query.prisma-repository.js"
import type { PlatformTenantMetricsReader } from "../../modules/platform-tenants/persistence/platform-tenant-metrics.reader.js"
import { PlatformTenantMetricsPrismaReader } from "../../modules/platform-tenants/persistence/prisma/platform-tenant-metrics.prisma-reader.js"
import type { PlatformTenantRepository } from "../../modules/platform-tenants/persistence/platform-tenant.repository.js"
import { PlatformTenantPrismaRepository } from "../../modules/platform-tenants/persistence/prisma/platform-tenant.prisma-repository.js"
import type { WorkspaceCatalogRepository } from "../../modules/platform-tenants/persistence/workspace-catalog.repository.js"
import { WorkspaceCatalogPrismaRepository } from "../../modules/platform-tenants/persistence/prisma/workspace-catalog.prisma-repository.js"
import type { PlatformAccessSessionRepository } from "../../modules/platform-users/persistence/platform-access-session.repository.js"
import { PlatformAccessSessionPrismaRepository } from "../../modules/platform-users/persistence/prisma/platform-access-session.prisma-repository.js"
import type { PlatformPasswordResetTokenRepository } from "../../modules/platform-users/persistence/platform-password-reset-token.repository.js"
import { PlatformPasswordResetTokenPrismaRepository } from "../../modules/platform-users/persistence/prisma/platform-password-reset-token.prisma-repository.js"
import type { PlatformUserRepository } from "../../modules/platform-users/persistence/platform-user.repository.js"
import { PlatformUserPrismaRepository } from "../../modules/platform-users/persistence/prisma/platform-user.prisma-repository.js"
import type { PlatformAuditRepository } from "../../modules/platform-users/persistence/platform-audit.repository.js"
import { PlatformAuditPrismaRepository } from "../../modules/platform-users/persistence/prisma/platform-audit.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import type { PersistenceDriver } from "./persistence-driver.js"

export type PlatformRepositories = {
  driver: PersistenceDriver
  auditDriver: PersistenceDriver
  user: PlatformUserRepository
  session: PlatformAccessSessionRepository
  passwordResetToken: PlatformPasswordResetTokenRepository
  tenant: PlatformTenantRepository
  catalog: WorkspaceCatalogRepository
  metrics: PlatformTenantMetricsReader
  platformAudit: PlatformAuditRepository
  platformAuditQuery: PlatformAuditQueryRepository
}

export function createWorkspaceCatalogRepository(prismaClient?: PrismaClient): WorkspaceCatalogRepository {
  return new WorkspaceCatalogPrismaRepository(prismaClient ?? getPrismaClient())
}

export function createPlatformTenantMetricsReader(prismaClient?: PrismaClient): PlatformTenantMetricsReader {
  return new PlatformTenantMetricsPrismaReader(prismaClient ?? getPrismaClient())
}

export function createPlatformRepositories(prismaClient?: PrismaClient): PlatformRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    auditDriver: "postgres",
    user: new PlatformUserPrismaRepository(prisma),
    session: new PlatformAccessSessionPrismaRepository(prisma),
    passwordResetToken: new PlatformPasswordResetTokenPrismaRepository(prisma),
    tenant: new PlatformTenantPrismaRepository(prisma),
    catalog: createWorkspaceCatalogRepository(prisma),
    metrics: createPlatformTenantMetricsReader(prisma),
    platformAudit: new PlatformAuditPrismaRepository(prisma),
    platformAuditQuery: new PlatformAuditQueryPrismaRepository(prisma),
  }
}
