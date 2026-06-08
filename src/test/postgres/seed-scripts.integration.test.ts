/**
 * Valida que el seed demo corre sobre Postgres de test (Testcontainers / DATABASE_URL_TEST).
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { execSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { getPrismaClient } from "../../infrastructure/postgres/prisma-client.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"
import { DEMO } from "../../scripts/seed/shared/ids-demo.js"

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..")

function runSeed(env: Record<string, string>, args: string): void {
  execSync(`npx tsx src/scripts/seed/run.ts ${args}`, {
    cwd: apiRoot,
    stdio: "pipe",
    env: { ...process.env, ...env },
  })
}

describe("Seed scripts — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext

  before(async () => {
    ctx = await startPostgresTestEnvironment()
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("db:reset:demo crea workspace ACME con Kanban y Scrum enriquecidos", async () => {
    const env = {
      DATABASE_URL: ctx.databaseUrl,
      ALLOW_DB_SEED: "1",
      SEED_TRUNCATE_RESET: "1",
      SEED_USER_PASSWORD: "TestSeed1234!",
    }
    runSeed(env, "--reset")

    const prisma = getPrismaClient({ databaseUrl: ctx.databaseUrl })
    try {
      const ws = await prisma.workspace.findUnique({ where: { public_id: DEMO.workspaceId } })
      assert.ok(ws)
      assert.equal(ws?.display_name, "ACME S.A.")

      const kanban = await prisma.project.findFirst({
        where: { public_id: DEMO.kanbanProjectId },
      })
      const scrum = await prisma.project.findFirst({
        where: { public_id: DEMO.scrumProjectId },
      })
      assert.ok(kanban)
      assert.ok(scrum)

      const kanbanItems = await prisma.workItem.count({
        where: { project_public_id: DEMO.kanbanProjectId },
      })
      assert.ok(kanbanItems >= 15)

      const cols = await prisma.kanbanColumn.count({
        where: { project_public_id: DEMO.kanbanProjectId },
      })
      assert.equal(cols, 4)

      const sprints = await prisma.sprint.count({
        where: { project_public_id: DEMO.scrumProjectId },
      })
      assert.ok(sprints >= 3)

      const comments = await prisma.workItemComment.count({
        where: { workspace_public_id: DEMO.workspaceId },
      })
      assert.ok(comments >= 2)

      const daily = await prisma.dailyAlignmentSession.count({
        where: { project_public_id: DEMO.scrumProjectId },
      })
      assert.ok(daily >= 1)

      const retroTopics = await prisma.guidedRetrospectiveTopic.count({
        where: { session_public_id: DEMO.retroSessionId },
      })
      assert.ok(retroTopics >= 2)
    } finally {
      await prisma.$disconnect()
    }
  })
})
