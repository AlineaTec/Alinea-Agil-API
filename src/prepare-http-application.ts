import type { Express } from "express"
import { createApp } from "./app.js"
import type { PlatformUsersService } from "./modules/platform-users/services/platform-users.service.js"

export type BootstrapFromEnvResult = Awaited<
  ReturnType<PlatformUsersService["bootstrapFromEnvIfNeeded"]>
>

/** Monta Express y ejecuta bootstrap de plataforma (idempotente). Requiere `DATABASE_URL`. */
export async function prepareHttpApplication(): Promise<{
  app: Express
  platformUsersService: PlatformUsersService
  bootstrap: BootstrapFromEnvResult
}> {
  const { app, platformUsersService } = createApp()
  const bootstrap = await platformUsersService.bootstrapFromEnvIfNeeded()
  return { app, platformUsersService, bootstrap }
}
