import type { PrismaClient } from "@prisma/client"
import type { ProjectDraftRepository } from "../../modules/workspace-projects/persistence/project-draft.repository.js"
import { ProjectDraftPrismaRepository } from "../../modules/workspace-projects/persistence/prisma/project-draft.prisma-repository.js"
import type { ProjectRuntimeRepository } from "../../modules/workspace-project-runtime/persistence/project-runtime.repository.js"
import { ProjectRuntimePrismaRepository } from "../../modules/workspace-project-runtime/persistence/prisma/project-runtime.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type ProjectsRepositories = {
  driver: PersistenceDriver
  draft: ProjectDraftRepository
  runtime: ProjectRuntimeRepository
}

export function createProjectsRepositories(
  prismaClient?: PrismaClient,
): ProjectsRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    draft: new ProjectDraftPrismaRepository(prisma),
      runtime: new ProjectRuntimePrismaRepository(prisma),
  }
}
