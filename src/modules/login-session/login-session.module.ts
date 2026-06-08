import type { Express } from "express"
import type { IdentityRepositories } from "../../infrastructure/persistence/identity-repositories.factory.js"
import { createIdentityRepositories } from "../../infrastructure/persistence/identity-repositories.factory.js"
import {
  TransactionalEmailService,
} from "../transactional-email/services/transactional-email.service.js"
import type { AuthMeResolutionService } from "../workspace-users/services/auth-me-resolution.service.js"
import { createAuthPublicRouter } from "./routes/auth.public.routes.js"
import { AuthBearerService } from "./services/auth-bearer.service.js"
import { LoginFlowService } from "./services/login-flow.service.js"
import { PasswordResetService } from "./services/password-reset.service.js"
import { ProfileUpdateService } from "./services/profile-update.service.js"

export type LoginSessionStack = {
  loginFlowService: LoginFlowService
  authBearerService: AuthBearerService
  profileUpdateService: ProfileUpdateService
  passwordResetService: PasswordResetService
}

/**
 * Una sola pila sesión + usuarios para que el mismo `AuthBearerService` valide tokens
 * en `/v1/auth` y en rutas protegidas (p. ej. workspace-users).
 */
export function createLoginSessionStack(
  transactionalEmail: TransactionalEmailService,
  identityRepositories: IdentityRepositories = createIdentityRepositories(),
): LoginSessionStack {
  const { registeredUsers, sessions, resetTokens } = identityRepositories
  const passwordResetService = new PasswordResetService(
    registeredUsers,
    resetTokens,
    sessions,
    transactionalEmail,
  )
  return {
    loginFlowService: new LoginFlowService(registeredUsers, sessions),
    authBearerService: new AuthBearerService(sessions, registeredUsers),
    profileUpdateService: new ProfileUpdateService(registeredUsers),
    passwordResetService,
  }
}

/** @deprecated Prefer `createLoginSessionStack` para compartir `AuthBearerService`. */
export function createLoginFlowService(): LoginFlowService {
  return createLoginSessionStack(TransactionalEmailService.createDefault()).loginFlowService
}

export type MountLoginSessionModuleOptions = {
  loginFlowService: LoginFlowService
  authBearerService: AuthBearerService
  profileUpdateService: ProfileUpdateService
  passwordResetService: PasswordResetService
  authMeResolution: AuthMeResolutionService
}

/** Monta `/v1/auth` (`POST /login`, `GET /me`, …). */
export function mountLoginSessionModule(
  app: Express,
  deps: MountLoginSessionModuleOptions,
): void {
  app.use(
    "/v1/auth",
    createAuthPublicRouter({
      loginFlowService: deps.loginFlowService,
      authBearerService: deps.authBearerService,
      profileUpdateService: deps.profileUpdateService,
      passwordResetService: deps.passwordResetService,
      authMeResolution: deps.authMeResolution,
    }),
  )
}
