/**
 * Persistencia única: PostgreSQL vía Prisma (`DATABASE_URL`).
 */
export type PersistenceDriver = "postgres"

export function assertDatabaseConfigured(): void {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required (PostgreSQL is the only supported persistence)")
  }
}

/** @deprecated Use assertDatabaseConfigured — kept for call sites during cleanup. */
export function assertCompatiblePersistenceDrivers(): void {
  assertDatabaseConfigured()
}

/** @deprecated Always postgres. */
export function getIdentityPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getWorkspacePersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getProjectsPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getWorkItemsPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getScrumPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getKanbanPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getGuidedSessionsPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getImpedimentsPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getWorkControlsPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getBillingPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getAuditPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getFeedbackPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getNbaSnoozePersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getPlatformAuditPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getPlatformPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export function getTransactionalEmailPersistenceDriver(): PersistenceDriver {
  return "postgres"
}

export type PersistenceDriversSnapshot = {
  identity: PersistenceDriver
  workspace: PersistenceDriver
  projects: PersistenceDriver
  workItems: PersistenceDriver
  scrum: PersistenceDriver
  kanban: PersistenceDriver
  guidedSessions: PersistenceDriver
  impediments: PersistenceDriver
  workControls: PersistenceDriver
  billing: PersistenceDriver
  audit: PersistenceDriver
  feedback: PersistenceDriver
  nbaSnooze: PersistenceDriver
  platform: PersistenceDriver
  platformAudit: PersistenceDriver
  transactionalEmail: PersistenceDriver
}

export function persistenceDriversSummary(): PersistenceDriversSnapshot {
  assertDatabaseConfigured()
  const postgres = "postgres" as const
  return {
    identity: postgres,
    workspace: postgres,
    projects: postgres,
    workItems: postgres,
    scrum: postgres,
    kanban: postgres,
    guidedSessions: postgres,
    impediments: postgres,
    workControls: postgres,
    billing: postgres,
    audit: postgres,
    feedback: postgres,
    nbaSnooze: postgres,
    platform: postgres,
    platformAudit: postgres,
    transactionalEmail: postgres,
  }
}
