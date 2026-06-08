import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { isProductionLikeEnvironment } from "./production-environment.js"

const keys = ["NODE_ENV", "VERCEL", "APP_ENV", "SENTRY_ENVIRONMENT"] as const

function snapshotEnv(): Record<(typeof keys)[number], string | undefined> {
  const out = {} as Record<(typeof keys)[number], string | undefined>
  for (const k of keys) out[k] = process.env[k]
  return out
}

function restoreEnv(prev: Record<(typeof keys)[number], string | undefined>): void {
  for (const k of keys) {
    const v = prev[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

describe("isProductionLikeEnvironment", () => {
  let prev: ReturnType<typeof snapshotEnv>

  afterEach(() => {
    restoreEnv(prev)
  })

  it("NODE_ENV=test → false (tests)", () => {
    prev = snapshotEnv()
    process.env.NODE_ENV = "test"
    delete process.env.VERCEL
    delete process.env.APP_ENV
    delete process.env.SENTRY_ENVIRONMENT
    assert.equal(isProductionLikeEnvironment(), false)
  })

  it("VERCEL=1 → true aunque NODE_ENV no sea production", () => {
    prev = snapshotEnv()
    delete process.env.NODE_ENV
    process.env.VERCEL = "1"
    assert.equal(isProductionLikeEnvironment(), true)
  })

  it("NODE_ENV=production → true", () => {
    prev = snapshotEnv()
    process.env.NODE_ENV = "production"
    delete process.env.VERCEL
    delete process.env.APP_ENV
    delete process.env.SENTRY_ENVIRONMENT
    assert.equal(isProductionLikeEnvironment(), true)
  })

  it("sin señales productivas → false", () => {
    prev = snapshotEnv()
    delete process.env.NODE_ENV
    delete process.env.VERCEL
    delete process.env.APP_ENV
    delete process.env.SENTRY_ENVIRONMENT
    assert.equal(isProductionLikeEnvironment(), false)
  })
})
