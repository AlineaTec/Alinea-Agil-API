/**
 * WorkReadyDoneControlsService — persistencia real vía repos inyectados (postgres).
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import {
  createRuntimePersistence,
  resetRuntimePersistenceCacheForTests,
} from "../../composition/runtime-persistence.js"
import { assertCompatiblePersistenceDrivers } from "../../infrastructure/persistence/persistence-driver.js"
import { createProjectsRepositories } from "../../infrastructure/persistence/projects-repositories.factory.js"
import { disconnectPrismaClient } from "../../infrastructure/postgres/prisma-client.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { emptyMaterializationMeta } from "../../modules/workspace-projects/domain/project-draft-materialization.js"
import { createProjectRuntimeService } from "../../modules/workspace-project-runtime/workspace-project-runtime.module.js"
import { buildDefaultV1Criteria } from "../../modules/work-ready-done-controls/domain/work-ready-done-build-default-criteria.js"
import { createWorkReadyDoneControlsService } from "../../modules/work-ready-done-controls/work-ready-done-controls.module.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "7a000000-0000-4000-8000-000000000001"
const WS_ID = "9a000000-0000-4000-8000-000000000003"
const ACTOR_ID = USER_ID

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
  "AUDIT_PERSISTENCE_DRIVER",
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

function setWorkControlsPostgresStack(): void {
  process.env.IDENTITY_PERSISTENCE_DRIVER = "postgres"
  process.env.WORKSPACE_PERSISTENCE_DRIVER = "postgres"
  process.env.PROJECTS_PERSISTENCE_DRIVER = "postgres"
  process.env.WORK_ITEMS_PERSISTENCE_DRIVER = "postgres"
  process.env.SCRUM_PERSISTENCE_DRIVER = "postgres"
  process.env.KANBAN_PERSISTENCE_DRIVER = "postgres"
  process.env.GUIDED_SESSIONS_PERSISTENCE_DRIVER = "postgres"
  process.env.IMPEDIMENTS_PERSISTENCE_DRIVER = "postgres"
  process.env.WORK_CONTROLS_PERSISTENCE_DRIVER = "postgres"
  process.env.AUDIT_PERSISTENCE_DRIVER = "postgres"
}

const serviceSourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../modules/work-ready-done-controls/services/work-ready-done-controls.service.ts",
)

describe("WorkReadyDoneControlsService — postgres repos", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  it("no importa drivers de persistencia legacy en el servicio", () => {
    const src = readFileSync(serviceSourcePath, "utf8")
    assert.doesNotMatch(src, /MongoModel/)
    assert.doesNotMatch(src, /from ["']mongoose["']/)
    assert.doesNotMatch(src, /persistence\/schemas\//)
  })

  describe("runtime PostgreSQL", () => {
    let ctx: PostgresTestContext
    let projectId: string
    let prevDatabaseUrl: string | undefined

    before(async () => {
      setWorkControlsPostgresStack()
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
        projectId = await seedProject()
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

    async function seedProject(): Promise<string> {
      const intentId = randomUUID()
      const pid = randomUUID()
      const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
      const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
      const workspaces = new WorkspacePrismaRepository(ctx.prisma)
      const email = `wc-svc-${Date.now()}@test.dev`
      await intents.create({
        intentPublicId: intentId,
        emailNormalized: email,
        status: "EMAIL_COLLECTED",
        expiresAt: defaultIntentExpiry(),
      })
      await users.createRegisteredUser({
        publicId: USER_ID,
        emailNormalized: email,
        fullName: "WC Service PG",
        passwordHash: "hash",
        modalityAtSignup: "individual",
        sourceRegistrationIntentPublicId: intentId,
      })
      await workspaces.create({
        workspacePublicId: WS_ID,
        slug: `wc-svc-${Date.now()}`,
        displayName: "WC Service",
        modality: "individual",
        sourceRegistrationIntentPublicId: intentId,
      })
      const projects = createProjectsRepositories(ctx.prisma)
      const now = new Date()
      const draftId = randomUUID()
      await projects.draft.insert({
        draftPublicId: draftId,
        workspacePublicId: WS_ID,
        createdByUserPublicId: USER_ID,
        status: "materialized",
        projectName: "WC Scrum",
        charter: { name: "WC Scrum" },
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
        projectName: "WC Scrum",
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
      return pid
    }

    function createService() {
      assertCompatiblePersistenceDrivers()
      const runtime = createRuntimePersistence()
      assert.equal(runtime.workControls.driver, "postgres")
      const projectRuntime = createProjectRuntimeService(
        runtime.projects.runtime,
        runtime.workspace,
      )
      return createWorkReadyDoneControlsService(
        projectRuntime,
        runtime.workItems.backlog,
        runtime.impediments.impediments,
        {
          projectProfiles: runtime.workControls.projectProfile,
          workspaceTemplates: runtime.workControls.workspaceTemplate,
          overrideTokens: runtime.workControls.overrideToken,
          workControlsAudit: runtime.audit.workControlsAudit,
        },
      )
    }

    it("getProjectProfile default y patchProjectProfile persisten en Postgres", async () => {
      const svc = createService()
      const before = await svc.getProjectProfile(WS_ID, projectId)
      assert.equal(before.persisted, false)
      assert.equal(before.profile.definitionSource, "system_default")

      const patched = await svc.patchProjectProfile(
        WS_ID,
        projectId,
        {
          criteria: buildDefaultV1Criteria().map((c) =>
            c.ruleId === "dor_acceptance_criteria_present"
              ? { ...c, isEnabled: false }
              : c,
          ),
          definitionSource: "project",
        },
        ACTOR_ID,
      )
      assert.equal(patched.definitionSource, "project")
      const disabled = patched.criteria.find((c) => c.ruleId === "dor_acceptance_criteria_present")
      assert.ok(disabled)
      assert.equal(disabled?.isEnabled, false)

      const after = await svc.getProjectProfile(WS_ID, projectId)
      assert.equal(after.persisted, true)
      const again = after.profile.criteria.find((c) => c.ruleId === "dor_acceptance_criteria_present")
      assert.equal(again?.isEnabled, false)

      const auditCount = await ctx.prisma.workControlsAuditEvent.count({
        where: {
          workspace_public_id: WS_ID,
          project_public_id: projectId,
          event: "project_profile_upserted",
        },
      })
      assert.ok(auditCount >= 1)
    })

    it("workspace template y applyWorkspaceTemplateToProject en Postgres", async () => {
      const svc = createService()
      const tpl = await svc.patchWorkspaceTemplate(
        WS_ID,
        buildDefaultV1Criteria().map((c) =>
          c.ruleId === "dor_description_present" ? { ...c, level: "warning" } : c,
        ),
        ACTOR_ID,
      )
      assert.equal(tpl.criteria.find((c) => c.ruleId === "dor_description_present")?.level, "warning")

      const applied = await svc.applyWorkspaceTemplateToProject(WS_ID, projectId, ACTOR_ID)
      assert.equal(applied.definitionSource, "workspace_template")
      assert.equal(
        applied.criteria.find((c) => c.ruleId === "dor_description_present")?.level,
        "warning",
      )

      const row = await ctx.prisma.workControlsProjectProfile.findFirst({
        where: {
          workspace_public_id: WS_ID,
          project_public_id: projectId,
          approach: "scrum",
        },
      })
      assert.ok(row)
      assert.equal(row?.definition_source, "workspace_template")
    })
  })
})
