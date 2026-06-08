import { assertDatabaseConfigured } from "../infrastructure/persistence/persistence-driver.js"
import {
  createAuditRepositories,
  type AuditRepositories,
} from "../infrastructure/persistence/audit-repositories.factory.js"
import {
  createBillingRepositories,
  type BillingRepositories,
} from "../infrastructure/persistence/billing-repositories.factory.js"
import {
  createFeedbackRepositories,
  type FeedbackRepositories,
} from "../infrastructure/persistence/feedback-repositories.factory.js"
import {
  createOperatingConsumersRepositories,
  type OperatingConsumersRepositories,
} from "../infrastructure/persistence/operating-consumers-repositories.factory.js"
import {
  createPlatformRepositories,
  type PlatformRepositories,
} from "../infrastructure/persistence/platform-repositories.factory.js"
import {
  createImpedimentsRepositories,
  type ImpedimentsRepositories,
} from "../infrastructure/persistence/impediments-repositories.factory.js"
import {
  createWorkControlsRepositories,
  type WorkControlsRepositories,
} from "../infrastructure/persistence/work-controls-repositories.factory.js"
import {
  createGuidedSessionsRepositories,
  type GuidedSessionsRepositories,
} from "../infrastructure/persistence/guided-sessions-repositories.factory.js"
import {
  createKanbanRepositories,
  type KanbanRepositories,
} from "../infrastructure/persistence/kanban-repositories.factory.js"
import {
  createScrumRepositories,
  type ScrumRepositories,
} from "../infrastructure/persistence/scrum-repositories.factory.js"
import {
  createIdentityRepositories,
  type IdentityRepositories,
} from "../infrastructure/persistence/identity-repositories.factory.js"
import {
  createProjectsRepositories,
  type ProjectsRepositories,
} from "../infrastructure/persistence/projects-repositories.factory.js"
import {
  createWorkItemsRepositories,
  type WorkItemsRepositories,
} from "../infrastructure/persistence/work-items-repositories.factory.js"
import {
  createWorkspaceRepositories,
  type WorkspaceRepositories,
} from "../infrastructure/persistence/workspace-repositories.factory.js"
import {
  createTransactionalEmailRepositories,
  type TransactionalEmailRepositories,
} from "../infrastructure/persistence/transactional-email-repositories.factory.js"

export type RuntimePersistence = {
  identity: IdentityRepositories
  workspace: WorkspaceRepositories
  projects: ProjectsRepositories
  workItems: WorkItemsRepositories
  scrum: ScrumRepositories
  kanban: KanbanRepositories
  guidedSessions: GuidedSessionsRepositories
  impediments: ImpedimentsRepositories
  workControls: WorkControlsRepositories
  billing: BillingRepositories
  audit: AuditRepositories
  feedback: FeedbackRepositories
  operatingConsumers: OperatingConsumersRepositories
  platform: PlatformRepositories
  transactionalEmail: TransactionalEmailRepositories
}

let cached: RuntimePersistence | undefined

/** Resuelve repositorios Prisma (una vez por proceso). */
export function createRuntimePersistence(): RuntimePersistence {
  if (cached) return cached
  assertDatabaseConfigured()
  cached = {
    identity: createIdentityRepositories(),
    workspace: createWorkspaceRepositories(),
    projects: createProjectsRepositories(),
    workItems: createWorkItemsRepositories(),
    scrum: createScrumRepositories(),
    kanban: createKanbanRepositories(),
    guidedSessions: createGuidedSessionsRepositories(),
    impediments: createImpedimentsRepositories(),
    workControls: createWorkControlsRepositories(),
    billing: createBillingRepositories(),
    audit: createAuditRepositories(),
    feedback: createFeedbackRepositories(),
    operatingConsumers: createOperatingConsumersRepositories(),
    platform: createPlatformRepositories(),
    transactionalEmail: createTransactionalEmailRepositories(),
  }
  return cached
}

/** Reinicia caché (tests). */
export function resetRuntimePersistenceCacheForTests(): void {
  cached = undefined
}
