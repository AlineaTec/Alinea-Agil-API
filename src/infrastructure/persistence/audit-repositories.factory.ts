import type { PrismaClient } from "@prisma/client"
import type { ImpedimentAuditRepository } from "../../modules/project-impediments/persistence/impediment-audit.repository.js"
import type { WorkspaceAuditLogRepository } from "../../modules/workspace-audit-log/persistence/workspace-audit-log.repository.js"
import type { WorkTeamAuditRepository } from "../../modules/workspace-work-teams/persistence/work-team-audit.repository.js"
import type { WorkControlsAuditRepository } from "../../modules/work-ready-done-controls/persistence/work-controls-audit.repository.js"
import { ImpedimentAuditPrismaRepository } from "../../modules/project-impediments/persistence/prisma/impediment-audit.prisma-repository.js"
import { WorkspaceAuditLogPrismaRepository } from "../../modules/workspace-audit-log/persistence/prisma/workspace-audit-log.prisma-repository.js"
import { WorkTeamAuditPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-audit.prisma-repository.js"
import { WorkControlsAuditPrismaRepository } from "../../modules/work-ready-done-controls/persistence/prisma/work-controls-audit.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type AuditRepositories = {
  driver: PersistenceDriver
  workspaceAudit: WorkspaceAuditLogRepository
  impedimentAudit: ImpedimentAuditRepository
  workControlsAudit: WorkControlsAuditRepository
  workTeamAudit: WorkTeamAuditRepository
}

export function createAuditRepositories(
  prismaClient?: PrismaClient,
): AuditRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    workspaceAudit: new WorkspaceAuditLogPrismaRepository(prisma),
      impedimentAudit: new ImpedimentAuditPrismaRepository(prisma),
      workControlsAudit: new WorkControlsAuditPrismaRepository(prisma),
      workTeamAudit: new WorkTeamAuditPrismaRepository(prisma),
  }
}
