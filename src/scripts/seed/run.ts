/**
 * Punto de entrada: seed PostgreSQL (demo ACME S.A.) para desarrollo local.
 *
 * Uso:
 *   ALLOW_DB_SEED=1 npm run seed
 *   ALLOW_DB_SEED=1 npm run db:reset:demo
 */
import "dotenv/config"
import { parseArgs } from "node:util"
import { assertSeedAllowed } from "./shared/guard.js"
import { createSeedContext, disconnectSeedContext } from "./shared/context.js"
import { resetDatabase } from "./shared/reset.js"
import { runDemoSeed } from "./demo.js"

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    reset: { type: "boolean", default: false },
  },
  allowPositionals: true,
})

const mode = positionals[0]

async function main(): Promise<void> {
  if (mode === "reset" && !values.reset) {
    await resetDatabase()
    return
  }

  if (values.reset) {
    await resetDatabase()
  }

  assertSeedAllowed()
  const ctx = createSeedContext()

  try {
    await runDemoSeed(ctx)
  } finally {
    await disconnectSeedContext(ctx)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
