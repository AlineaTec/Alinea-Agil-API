import type { PrismaClient } from "@prisma/client"
import type { GuidedSprintPlanningBaselineRepository } from "../../modules/guided-sprint-planning/persistence/guided-sprint-planning-baseline.repository.js"
import { GuidedSprintPlanningBaselinePrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-baseline.prisma-repository.js"
import type { GuidedSprintPlanningCandidateItemRepository } from "../../modules/guided-sprint-planning/persistence/guided-sprint-planning-candidate-item.repository.js"
import { GuidedSprintPlanningCandidateItemPrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-candidate-item.prisma-repository.js"
import type { GuidedSprintPlanningSessionRepository } from "../../modules/guided-sprint-planning/persistence/guided-sprint-planning-session.repository.js"
import { GuidedSprintPlanningSessionPrismaRepository } from "../../modules/guided-sprint-planning/persistence/prisma/guided-sprint-planning-session.prisma-repository.js"
import type { ScrumSprintPlanningRepository } from "../../modules/project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import { ScrumSprintPlanningPrismaRepository } from "../../modules/project-scrum-sprint-planning/persistence/prisma/scrum-sprint-planning.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type ScrumRepositories = {
  driver: PersistenceDriver
  sprintPlanning: ScrumSprintPlanningRepository
  guidedSession: GuidedSprintPlanningSessionRepository
  guidedCandidateItem: GuidedSprintPlanningCandidateItemRepository
  guidedBaseline: GuidedSprintPlanningBaselineRepository
}

export function createScrumRepositories(
  prismaClient?: PrismaClient,
): ScrumRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    sprintPlanning: new ScrumSprintPlanningPrismaRepository(prisma),
      guidedSession: new GuidedSprintPlanningSessionPrismaRepository(prisma),
      guidedCandidateItem: new GuidedSprintPlanningCandidateItemPrismaRepository(prisma),
      guidedBaseline: new GuidedSprintPlanningBaselinePrismaRepository(prisma),
  }
}
