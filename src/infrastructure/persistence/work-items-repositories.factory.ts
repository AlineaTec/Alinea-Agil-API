import type { PrismaClient } from "@prisma/client"
import type { ScrumBacklogRepository } from "../../modules/project-scrum-backlog/persistence/scrum-backlog.repository.js"
import { ScrumBacklogPrismaRepository } from "../../modules/project-scrum-backlog/persistence/prisma/scrum-backlog.prisma-repository.js"
import type { WorkItemCommentsRepository } from "../../modules/work-item-comments/persistence/work-item-comments.repository.js"
import { WorkItemCommentsPrismaRepository } from "../../modules/work-item-comments/persistence/prisma/work-item-comments.prisma-repository.js"
import type { WorkItemTimeEntriesRepository } from "../../modules/work-item-time-logging/persistence/work-item-time-entries.repository.js"
import { WorkItemTimeEntriesPrismaRepository } from "../../modules/work-item-time-logging/persistence/prisma/work-item-time-entries.prisma-repository.js"
import type { WorkActivityNotificationRepository } from "../../modules/work-activity-notifications/persistence/work-activity-notification.repository.js"
import { WorkActivityNotificationPrismaRepository } from "../../modules/work-activity-notifications/persistence/prisma/work-activity-notification.prisma-repository.js"
import type { WorkItemImplicitFollowRepository } from "../../modules/work-activity-notifications/persistence/work-item-implicit-follow.repository.js"
import { WorkItemImplicitFollowPrismaRepository } from "../../modules/work-activity-notifications/persistence/prisma/work-item-implicit-follow.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type WorkItemsRepositories = {
  driver: PersistenceDriver
  backlog: ScrumBacklogRepository
  comments: WorkItemCommentsRepository
  timeEntries: WorkItemTimeEntriesRepository
  notifications: WorkActivityNotificationRepository
  implicitFollows: WorkItemImplicitFollowRepository
}

export function createWorkItemsRepositories(
  prismaClient?: PrismaClient,
): WorkItemsRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    backlog: new ScrumBacklogPrismaRepository(prisma),
      comments: new WorkItemCommentsPrismaRepository(prisma),
      timeEntries: new WorkItemTimeEntriesPrismaRepository(prisma),
      notifications: new WorkActivityNotificationPrismaRepository(prisma),
      implicitFollows: new WorkItemImplicitFollowPrismaRepository(prisma),
  }
}
