import type { Express } from "express"
import type { RuntimePersistence } from "../../composition/runtime-persistence.js"
import { createRuntimePersistence } from "../../composition/runtime-persistence.js"
import {
  createWorkspaceLicenseService,
  type WorkspaceLicenseService,
} from "../workspace-licenses/workspace-licenses.module.js"
import {
  createWorkspaceUserService,
  type WorkspaceUserService,
} from "../workspace-users/workspace-users.module.js"
import { ProvisionalEnvAccountLookup } from "./integrations/accounts/account-lookup.port.js"
import {
  createWorkspaceSlugMaterializedLookup,
  NoopRegistrationPayment,
  NoopTransactionalEmail,
  RegistrationTransactionalEmailAdapter,
  RepositoryAccountLookup,
} from "./integrations/index.js"
import type { TransactionalEmailPort } from "./integrations/email/transactional-email.port.js"
import type { TransactionalEmailService } from "../transactional-email/services/transactional-email.service.js"
import type { WorkspaceBillingStateService } from "../billing-seat-enforcement/services/workspace-billing-state.service.js"
import { createRegistrationProvisioning } from "./integrations/provisioning/registration-provisioning.factory.js"
import { commercialRegistrationApiGate } from "../../config/payment-gateway-policy.js"
import { createRegistrationCriticalRateLimiter } from "../../http-rate-limit.js"
import { createRegistrationPublicRouter, createPaddleCompleteHandler } from "./routes/registration.public.routes.js"
import { RegistrationFlowService } from "./services/registration-flow.service.js"

export type RegistroOnboardingModuleOptions = {
  /** Si se omite, se resuelve desde env (`createRuntimePersistence`). */
  runtimePersistence?: RuntimePersistence
  /** Si se omite, se crea una instancia local (misma DB, distinto objeto servicio). */
  workspaceLicenseService?: WorkspaceLicenseService
  workspaceUserService?: WorkspaceUserService
  /** Si se omite, no se envían correos (Noop). */
  transactionalEmailService?: TransactionalEmailService
  /** Vincular `sub_*` al snapshot tras activación pagada (portal de facturación). */
  workspaceBillingStateService?: WorkspaceBillingStateService
}

/**
 * Compone dependencias del módulo y monta rutas.
 * Punto único de ensamblaje para tests e invocación desde `app.ts`.
 */
export function mountRegistroOnboardingModule(
  app: Express,
  options: RegistroOnboardingModuleOptions = {},
): RegistrationFlowService {
  const persistence = options.runtimePersistence ?? createRuntimePersistence()
  const workspaceLicenseService =
    options.workspaceLicenseService ??
    createWorkspaceLicenseService(undefined, persistence.workspace.license)
  const workspaceUserService =
    options.workspaceUserService ??
    createWorkspaceUserService(
      workspaceLicenseService,
      undefined,
      undefined,
      persistence.workspace.member,
    )

  const accountLookup = new RepositoryAccountLookup(
    new ProvisionalEnvAccountLookup(),
    persistence.identity.registeredUsers,
  )
  const email: TransactionalEmailPort =
    options.transactionalEmailService !== undefined
      ? new RegistrationTransactionalEmailAdapter(options.transactionalEmailService)
      : new NoopTransactionalEmail()
  const payment = new NoopRegistrationPayment()
  const provisioning = createRegistrationProvisioning(
    workspaceLicenseService,
    workspaceUserService,
    persistence.identity,
    persistence.workspace,
  )

  const registrationFlowService = new RegistrationFlowService(
    persistence.identity.registrationIntents,
    persistence.identity.verificationChallenges,
    accountLookup,
    email,
    payment,
    provisioning,
    options.workspaceBillingStateService ?? null,
    createWorkspaceSlugMaterializedLookup(persistence.workspace.workspace),
  )

  const registrationCriticalRateLimit = createRegistrationCriticalRateLimiter()

  /** Alias estable (menos segmentos) por si un proxy no reenvía rutas bajo `/registration/payment/`. */
  app.post(
    "/v1/public/registration-payment/paddle-complete",
    registrationCriticalRateLimit,
    commercialRegistrationApiGate,
    createPaddleCompleteHandler(registrationFlowService),
  )

  app.use(
    "/v1/public/registration",
    createRegistrationPublicRouter(registrationFlowService, registrationCriticalRateLimit),
  )

  return registrationFlowService
}
