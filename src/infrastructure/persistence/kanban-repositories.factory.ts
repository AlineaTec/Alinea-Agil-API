import type { PrismaClient } from "@prisma/client"
import type { KanbanFlowRepository } from "../../modules/project-kanban-core/persistence/kanban-flow.repository.js"
import { KanbanFlowPrismaRepository } from "../../modules/project-kanban-core/persistence/prisma/kanban-flow.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type KanbanRepositories = {
  driver: PersistenceDriver
  flow: KanbanFlowRepository
}

export function createKanbanRepositories(
  prismaClient?: PrismaClient,
): KanbanRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    flow: new KanbanFlowPrismaRepository(prisma),
  }
}
