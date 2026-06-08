import { hashPlatformPassword } from "../../../modules/platform-users/services/platform-password.js"
import { resolveSeedPlatformPassword } from "./credentials.js"
import type { SeedContext } from "./context.js"

export type PlatformSeedOptions = {
  platformUserId: string
  email: string
  displayName: string
  passwordPlain?: string
}

export async function seedPlatformAdmin(
  ctx: SeedContext,
  opts: PlatformSeedOptions,
): Promise<void> {
  const password = opts.passwordPlain ?? resolveSeedPlatformPassword()
  const { salt, hash } = hashPlatformPassword(password)
  const now = ctx.now
  await ctx.prisma.platformUser.upsert({
    where: { email: opts.email },
    create: {
      platform_user_id: opts.platformUserId,
      email: opts.email,
      display_name: opts.displayName,
      role: "platform_super_admin",
      status: "active",
      mfa_status: "not_enrolled",
      password_salt: salt,
      password_hash: hash,
      created_at: now,
      updated_at: now,
    },
    update: {
      role: "platform_super_admin",
      status: "active",
      password_salt: salt,
      password_hash: hash,
      display_name: opts.displayName,
      updated_at: now,
    },
  })
  ctx.log(`Platform admin: ${opts.email} (password vía SEED_PLATFORM_PASSWORD o default)`)
}
