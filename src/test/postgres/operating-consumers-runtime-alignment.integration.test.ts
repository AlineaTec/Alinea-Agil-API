/**
 * Fase 11 — consumidores agregados alineados con runtimePersistence.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import {
  createRuntimePersistence,
  resetRuntimePersistenceCacheForTests,
} from "../../composition/runtime-persistence.js"
import { operatingSnapshotRuntimeSourcesFrom } from "../../composition/operating-snapshot-runtime-sources.js"
import { createOperatingSnapshotService } from "../../modules/project-operating-snapshot/project-operating-snapshot.module.js"
import { OperatingSnapshotCache } from "../../modules/project-operating-snapshot/services/operating-snapshot-cache.js"
import { createProjectsRepositories } from "../../infrastructure/persistence/projects-repositories.factory.js"
import { createImpedimentsRepositories } from "../../infrastructure/persistence/impediments-repositories.factory.js"
import { createWorkspaceRepositories } from "../../infrastructure/persistence/workspace-repositories.factory.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { emptyMaterializationMeta } from "../../modules/workspace-projects/domain/project-draft-materialization.js"
import { createProjectRuntimeService } from "../../modules/workspace-project-runtime/workspace-project-runtime.module.js"
import type { WorkspaceMemberState } from "../../modules/workspace-users/domain/workspace-member.js"
import { createTeamOperationalMetricsService } from "../../modules/team-operational-metrics/team-operational-metrics.module.js"
import type { WorkspaceUserService } from "../../modules/workspace-users/services/workspace-user.service.js"
import { disconnectPrismaClient } from "../../infrastructure/postgres/prisma-client.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "79000000-0000-4000-8000-000000000001"
const WS_ID = "99000000-0000-4000-8000-000000000003"
const TEAM_ID = "99000000-0000-4000-8000-000000000010"

const ENV_KEYS = [
  "IDENTITY_PERSISTENCE_DRIVER",
  "WORKSPACE_PERSISTENCE_DRIVER",
  "PROJECTS_PERSISTENCE_DRIVER",
  "WORK_ITEMS_PERSISTENCE_DRIVER",
  "SCRUM_PERSISTENCE_DRIVER",
  "KANBAN_PERSISTENCE_DRIVER",
  "GUIDED_SESSIONS_PERSISTENCE_DRIVER",
  "IMPEDIMENTS_PERSISTENCE_DRIVER",
  "WORK_CONTROLS_PERSISTENCE_DRIVER",
]

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const prev: Record<string, string | undefined> = {}
  for (const k of keys) prev[k] = process.env[k]
  return prev
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  resetRuntimePersistenceCacheForTests()
}

function setStackPostgresDrivers(): void {
  process.env.IDENTITY_PERSISTENCE_DRIVER = "postgres"
  process.env.WORKSPACE_PERSISTENCE_DRIVER = "postgres"
  process.env.PROJECTS_PERSISTENCE_DRIVER = "postgres"
  process.env.WORK_ITEMS_PERSISTENCE_DRIVER = "postgres"
  process.env.SCRUM_PERSISTENCE_DRIVER = "postgres"
  process.env.KANBAN_PERSISTENCE_DRIVER = "postgres"
  process.env.GUIDED_SESSIONS_PERSISTENCE_DRIVER = "postgres"
  process.env.IMPEDIMENTS_PERSISTENCE_DRIVER = "postgres"
  process.env.WORK_CONTROLS_PERSISTENCE_DRIVER = "postgres"
  process.env.NBA_SNOOZE_PERSISTENCE_DRIVER = "postgres"
}

function adminActor(): WorkspaceMemberState {
  const now = new Date()
  return {
    membershipPublicId: randomUUID(),
    workspacePublicId: WS_ID,
    userPublicId: USER_ID,
    emailNormalized: "admin@test.dev",
    fullName: "Admin",
    status: "active",
    hasSeatAssigned: true,
    workspaceRoleAdministrative: "admin",
    workspaceRoleMethodological: null,
    createdAt: now,
    updatedAt: now,
  }
}

describe("Runtime alignment — operating snapshot & team metrics", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  describe("PostgreSQL stack", () => {
    let ctx: PostgresTestContext
    let projectId: string
    let runtime: ReturnType<typeof createRuntimePersistence>
    let prevDatabaseUrl: string | undefined

    before(async () => {
      setStackPostgresDrivers()
      resetRuntimePersistenceCacheForTests()
      const prevTestUrl = process.env.DATABASE_URL_TEST
      const prevUseEnv = process.env.POSTGRES_TEST_USE_ENV
      delete process.env.DATABASE_URL_TEST
      delete process.env.POSTGRES_TEST_USE_ENV
      try {
        ctx = await startPostgresTestEnvironment()
        prevDatabaseUrl = process.env.DATABASE_URL
        process.env.DATABASE_URL = ctx.databaseUrl
        await disconnectPrismaClient()
        resetRuntimePersistenceCacheForTests()
        projectId = await seedWorkspaceAndProject()
        runtime = createRuntimePersistence()
      } finally {
        if (prevTestUrl === undefined) delete process.env.DATABASE_URL_TEST
        else process.env.DATABASE_URL_TEST = prevTestUrl
        if (prevUseEnv === undefined) delete process.env.POSTGRES_TEST_USE_ENV
        else process.env.POSTGRES_TEST_USE_ENV = prevUseEnv
      }
    }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

    after(async () => {
      await ctx.stop()
      if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = prevDatabaseUrl
      await disconnectPrismaClient()
      restoreEnv(saveEnv(ENV_KEYS))
    })

    async function seedWorkspaceAndProject(): Promise<string> {
      const intentId = randomUUID()
      const pid = randomUUID()
      const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
      const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
      const workspaces = new WorkspacePrismaRepository(ctx.prisma)
      const email = `op-consumers-${Date.now()}@test.dev`
      await intents.create({
        intentPublicId: intentId,
        emailNormalized: email,
        status: "EMAIL_COLLECTED",
        expiresAt: defaultIntentExpiry(),
      })
      await users.createRegisteredUser({
        publicId: USER_ID,
        emailNormalized: email,
        fullName: "Op Consumers",
        passwordHash: "hash",
        modalityAtSignup: "individual",
        sourceRegistrationIntentPublicId: intentId,
      })
      await workspaces.create({
        workspacePublicId: WS_ID,
        slug: `op-cons-${Date.now()}`,
        displayName: "Op Consumers",
        modality: "individual",
        sourceRegistrationIntentPublicId: intentId,
      })

      const projects = createProjectsRepositories(ctx.prisma)
      const workspaceRepos = createWorkspaceRepositories(ctx.prisma)
      const now = new Date()
      const draftId = randomUUID()
      await projects.draft.insert({
        draftPublicId: draftId,
        workspacePublicId: WS_ID,
        createdByUserPublicId: USER_ID,
        status: "materialized",
        projectName: "Snapshot PG",
        charter: { name: "Snapshot PG" },
        methodologyAssessment: {
          teamMethodologicalMaturity: 3,
          controlTraceabilityComplianceNeed: 2,
          workNature: "product_delivery",
          uncertaintyLevel: 3,
          scopeStability: 3,
          changeAcceptance: 3,
          deliveryShape: "incremental_iterative",
          interruptionFrequency: 2,
          prioritizationType: "business_value",
        },
        recommendationResult: null,
        selectedApproach: "scrum",
        wasRecommendationOverridden: null,
        overrideJustification: null,
        materializedProjectPublicId: pid,
        trace: [],
        materialization: emptyMaterializationMeta(),
        createdAt: now,
        updatedAt: now,
      })
      await projects.runtime.insert({
        projectPublicId: pid,
        workspacePublicId: WS_ID,
        sourceDraftPublicId: draftId,
        projectName: "Snapshot PG",
        operationalApproach: "scrum",
        initialConfigurationSummary: {
          kind: "scrum",
          materializationContainerReady: true,
          backlog: true,
          sprints: true,
          board: true,
          baseWorkItemTypes: true,
          baseMetrics: false,
        },
        status: "active",
        materializedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      await workspaceRepos.workTeam.insert({
        teamPublicId: TEAM_ID,
        workspacePublicId: WS_ID,
        name: "Equipo PG",
        nameNormalized: "equipo pg",
        description: null,
        status: "active",
        teamLeadUserPublicId: USER_ID,
        targetSize: null,
        createdAt: now,
        updatedAt: now,
      })
      await workspaceRepos.workTeamMembership.insert({
        teamMembershipPublicId: randomUUID(),
        workspacePublicId: WS_ID,
        teamPublicId: TEAM_ID,
        userPublicId: USER_ID,
        joinedAt: now,
        leftAt: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      await workspaceRepos.workTeamProjectLink.insert({
        teamProjectLinkPublicId: randomUUID(),
        workspacePublicId: WS_ID,
        teamPublicId: TEAM_ID,
        projectPublicId: pid,
        createdAt: now,
        updatedAt: now,
      })

      const impediments = createImpedimentsRepositories(ctx.prisma)
      await impediments.impediments.insert({
        impedimentPublicId: randomUUID(),
        workspacePublicId: WS_ID,
        projectPublicId: pid,
        relatedWorkItemPublicId: null,
        relatedSprintPublicId: null,
        title: "Crítico PG",
        description: "",
        status: "open",
        severity: "critical",
        responsibleUserPublicId: null,
        reportedByUserPublicId: USER_ID,
        detectedAt: now,
        resolvedAt: null,
        dismissedAt: null,
        resolutionSummary: null,
        dismissalReason: null,
        createdAt: now,
        updatedAt: now,
      })

      return pid
    }

    it("operatingSnapshotRuntimeSourcesFrom expone drivers postgres", () => {
      const sources = operatingSnapshotRuntimeSourcesFrom(runtime)
      assert.equal(runtime.scrum.driver, "postgres")
      assert.equal(runtime.guidedSessions.driver, "postgres")
      assert.equal(runtime.impediments.driver, "postgres")
      assert.equal(sources.impediments, runtime.impediments.impediments)
      assert.equal(sources.sprintPlanning, runtime.scrum.sprintPlanning)
    })

    it("operating snapshot lee impediments desde Postgres", async () => {
      const projectRuntime = createProjectRuntimeService(
        runtime.projects.runtime,
        runtime.workspace,
      )
      const snapshotSvc = createOperatingSnapshotService(projectRuntime, runtime, {
        cache: new OperatingSnapshotCache(),
      })
      assert.equal(runtime.operatingConsumers.driver, "postgres")
      const snap = await snapshotSvc.getOperatingSnapshot(adminActor(), WS_ID, projectId, {
        forceRefresh: true,
      })
      assert.equal(snap.signals.criticalImpedimentCount, 1)
      assert.equal(snap.signals.openImpedimentCount, 1)
      const criticalAlert = snap.alerts.find((a) => a.alertId === "ALERT_CRITICAL_IMPEDIMENT")
      assert.ok(criticalAlert)
    })

    it("team-operational-metrics cuenta impediments desde Postgres", async () => {
      const metricsSvc = createTeamOperationalMetricsService({} as WorkspaceUserService, {
        teams: runtime.workspace.workTeam,
        memberships: runtime.workspace.workTeamMembership,
        projectLinks: runtime.workspace.workTeamProjectLink,
        backlog: runtime.workItems.backlog,
        impediments: runtime.impediments.impediments,
        projectRuntime: runtime.projects.runtime,
      })

      const summary = await metricsSvc.getTeamMetricsSummary(adminActor(), WS_ID, TEAM_ID, undefined)
      assert.equal(summary.openImpedimentsCount, 1)
      assert.equal(summary.criticalOpenImpedimentsCount, 1)
    })
  })
})
