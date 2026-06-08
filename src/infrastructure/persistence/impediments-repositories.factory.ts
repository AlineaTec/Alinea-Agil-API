import type { PrismaClient } from "@prisma/client"
import type { ImpedimentRepository } from "../../modules/project-impediments/persistence/impediment.repository.js"
import type { ProjectImpedimentCommentsRepository } from "../../modules/project-impediments/persistence/impediment-comments.repository.js"
import { ImpedimentPrismaRepository } from "../../modules/project-impediments/persistence/prisma/impediment.prisma-repository.js"
import { ProjectImpedimentCommentPrismaRepository } from "../../modules/project-impediments/persistence/prisma/impediment-comment.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type ImpedimentsRepositories = {
  driver: PersistenceDriver
  impediments: ImpedimentRepository
  comments: ProjectImpedimentCommentsRepository
}

export function createImpedimentsRepositories(
  prismaClient?: PrismaClient,
): ImpedimentsRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    impediments: new ImpedimentPrismaRepository(prisma),
      comments: new ProjectImpedimentCommentPrismaRepository(prisma),
  }
}
