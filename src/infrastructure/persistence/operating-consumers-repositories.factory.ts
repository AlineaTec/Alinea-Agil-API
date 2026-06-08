import type { PrismaClient } from "@prisma/client"
import type { OperatingSnapshotNbaSnoozeRepository } from "../../modules/project-operating-snapshot/persistence/operating-snapshot-nba-snooze.repository.js"
import { OperatingSnapshotNbaSnoozePrismaRepository } from "../../modules/project-operating-snapshot/persistence/prisma/operating-snapshot-nba-snooze.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type OperatingConsumersRepositories = {
  driver: PersistenceDriver
  nbaSnooze: OperatingSnapshotNbaSnoozeRepository
}

export function createOperatingConsumersRepositories(
  prismaClient?: PrismaClient,
): OperatingConsumersRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    nbaSnooze: new OperatingSnapshotNbaSnoozePrismaRepository(prisma),
  }
}
