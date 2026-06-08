import type { PrismaClient } from "@prisma/client"
import type { WorkControlOverrideTokenRepository } from "../../modules/work-ready-done-controls/persistence/work-control-override-token.repository.js"
import type { WorkControlsProjectProfileRepository } from "../../modules/work-ready-done-controls/persistence/work-controls-project-profile.repository.js"
import type { WorkControlsWorkspaceTemplateRepository } from "../../modules/work-ready-done-controls/persistence/work-controls-workspace-template.repository.js"
import { WorkControlOverrideTokenPrismaRepository } from "../../modules/work-ready-done-controls/persistence/prisma/work-control-override-token.prisma-repository.js"
import { WorkControlsProjectProfilePrismaRepository } from "../../modules/work-ready-done-controls/persistence/prisma/work-controls-project-profile.prisma-repository.js"
import { WorkControlsWorkspaceTemplatePrismaRepository } from "../../modules/work-ready-done-controls/persistence/prisma/work-controls-workspace-template.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type WorkControlsRepositories = {
  driver: PersistenceDriver
  projectProfile: WorkControlsProjectProfileRepository
  workspaceTemplate: WorkControlsWorkspaceTemplateRepository
  overrideToken: WorkControlOverrideTokenRepository
}

export function createWorkControlsRepositories(
  prismaClient?: PrismaClient,
): WorkControlsRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    projectProfile: new WorkControlsProjectProfilePrismaRepository(prisma),
      workspaceTemplate: new WorkControlsWorkspaceTemplatePrismaRepository(prisma),
      overrideToken: new WorkControlOverrideTokenPrismaRepository(prisma),
  }
}
