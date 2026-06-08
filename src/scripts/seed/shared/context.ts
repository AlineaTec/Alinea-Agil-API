import type { PrismaClient } from "@prisma/client"
import { getPrismaClient } from "../../../infrastructure/postgres/prisma-client.js"
import { assertDatabaseConfigured } from "../../../infrastructure/persistence/persistence-driver.js"
import { hashIdentityRegistrationIntentPassword } from "../../../modules/registro-onboarding/services/intent-password-hash.js"
import { resolveSeedUserPassword } from "./credentials.js"
import { seedLog } from "./log.js"

export type SeedContext = {
  prisma: PrismaClient
  passwordPlain: string
  passwordHash: string
  now: Date
  log: typeof seedLog
}

export function createSeedContext(): SeedContext {
  assertDatabaseConfigured()
  const passwordPlain = resolveSeedUserPassword()
  if (passwordPlain.length < 10) {
    throw new Error("SEED_USER_PASSWORD debe tener al menos 10 caracteres")
  }
  return {
    prisma: getPrismaClient(),
    passwordPlain,
    passwordHash: hashIdentityRegistrationIntentPassword(passwordPlain),
    now: new Date(),
    log: seedLog,
  }
}

export async function disconnectSeedContext(ctx: SeedContext): Promise<void> {
  await ctx.prisma.$disconnect()
}
