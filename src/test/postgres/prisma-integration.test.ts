/**
 * Integración real: PostgreSQL (Testcontainers) + Prisma migrate deploy + CRUD mínimo.
 * Requiere Docker. No forma parte de `npm test` (ver npm run test:postgres).
 */
import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

describe("PostgreSQL + Prisma (integración)", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext

  before(async () => {
    ctx = await startPostgresTestEnvironment()
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("aplica migraciones y persiste en infrastructure_connectivity_probe", async () => {
    const prisma = ctx.prisma
    const probeKey = `integration-${Date.now()}`
    const created = await prisma.infrastructureConnectivityProbe.create({
      data: { probe_key: probeKey },
    })
    assert.equal(created.probe_key, probeKey)
    assert.ok(created.id)

    const found = await prisma.infrastructureConnectivityProbe.findUnique({
      where: { probe_key: probeKey },
    })
    assert.ok(found)
    assert.equal(found?.id, created.id)

    await prisma.infrastructureConnectivityProbe.delete({ where: { id: created.id } })
  })
})
