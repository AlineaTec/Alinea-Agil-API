import type { Express } from "express"
import { Router } from "express"
import {
  createProductIdeaFeedbackEntryService,
  mountProductIdeaFeedbackEntryPlatformRoutes,
} from "../product-idea-feedback/product-idea-feedback.module.js"
import {
  createProductFeedbackService,
  mountProductFeedbackPlatformRoutes,
} from "../product-feedback/product-feedback.module.js"
import type { ProductIdeaFeedbackEntryService } from "../product-idea-feedback/services/product-idea-feedback.service.js"
import type { ProductFeedbackService } from "../product-feedback/services/product-feedback.service.js"
import { mountPlatformAuditRoutes } from "../platform-audit/platform-audit.module.js"
import { mountPlatformObservabilityRoutes } from "../platform-observability/platform-observability.module.js"
import { mountPlatformLicensingRoutes } from "../platform-licensing/platform-licensing.module.js"
import { mountPlatformBillingRoutes } from "../platform-billing/platform-billing.module.js"
import type { BillingRepositories } from "../../infrastructure/persistence/billing-repositories.factory.js"
import type { FeedbackRepositories } from "../../infrastructure/persistence/feedback-repositories.factory.js"
import type { PlatformRepositories } from "../../infrastructure/persistence/platform-repositories.factory.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { WorkspaceMemberRepository } from "../workspace-users/persistence/workspace-member.repository.js"
import { mountPlatformBillingOperationsRoutes } from "../platform-billing-operations/platform-billing-operations.module.js"
import { getPrismaClient } from "../../infrastructure/postgres/prisma-client.js"
import { mountPlatformRegistrationPaddleRoutes } from "../platform-registration-payments/platform-registration-payments.module.js"
import { requireInjected } from "../../infrastructure/persistence/require-injected.js"
import { mountPlatformIdentityRegistrationIntentsRoutes } from "../platform-registration-intents/platform-registration-intents.module.js"
import {
  mountPlatformTenantsRoutes,
  type PlatformTenantsModuleDeps,
} from "../platform-tenants/platform-tenants.module.js"
import { createPlatformWorkspaceInvitationsRouter } from "../workspace-invitations/routes/workspace-invitations.platform.routes.js"
import type { WorkspaceInvitationService } from "../workspace-invitations/services/workspace-invitation.service.js"
import { platformAuthMiddleware } from "./middleware/platform-auth.middleware.js"
import { createPlatformAuthPublicRouter } from "./routes/platform-auth.public.routes.js"
import { createPlatformUsersRouter } from "./routes/platform-users.routes.js"
import { PlatformAuditService } from "./services/platform-audit.service.js"
import { PlatformAuthService } from "./services/platform-auth.service.js"
import { PlatformMfaTotpService } from "./services/platform-mfa-totp.service.js"
import { PlatformPasswordResetService } from "./services/platform-password-reset.service.js"
import type { TransactionalEmailService } from "../transactional-email/services/transactional-email.service.js"
import { PlatformUsersService } from "./services/platform-users.service.js"

export type PlatformUsersModuleHandles = {
  platformUsersService: PlatformUsersService
  platformAuthService: PlatformAuthService
}

export type MountPlatformUsersModuleOptions = {
  transactionalEmailService?: TransactionalEmailService | null
  productIdeaFeedbackService?: ProductIdeaFeedbackEntryService
  /** Feedback de producto unificado (`/v1/platform/product-feedback`). */
  productFeedbackService?: ProductFeedbackService
  /** Recibos de pago (listado/descarga plataforma); opcional. */
  paymentReceiptAccess?: import("../payment-receipts/services/payment-receipt-access.service.js").PaymentReceiptAccessService | null
  /** Gestión operativa de invitaciones a workspace (sesión plataforma). */
  workspaceInvitationService?: WorkspaceInvitationService | null
  /** Repos billing (snapshots, audit billing, notificaciones); alinea con `BILLING_PERSISTENCE_DRIVER`. */
  billing?: BillingRepositories
  /** Repos feedback; alinea con `FEEDBACK_PERSISTENCE_DRIVER`. */
  feedback?: FeedbackRepositories
  /** Runtime de proyectos para validación en feedback (mismo driver que `PROJECTS_PERSISTENCE_DRIVER`). */
  projectRuntime?: ProjectRuntimeRepository
  /** Members workspace para billing operations cuando workspace está en PG. */
  workspaceMembers?: WorkspaceMemberRepository
  /** Repos plataforma (users/sessions/reset/tenants/catalog/metrics/audit); alinea drivers por env. */
  platform?: PlatformRepositories
  /** Licencias workspace para módulos platform que las necesitan. */
  workspaceLicense?: import("../workspace-licenses/persistence/workspace-license.repository.js").WorkspaceLicenseRepository
}

/**
 * Backend **plataforma** (`/v1/platform/*`): separado de sesión cliente (`/v1/auth`).
 * Routers autenticados: users → tenants → billing → registration paddle → registration intents → licensing → audit → observability (ver `modules/platform/README.md`).
 */
export function mountPlatformUsersModule(
  app: Express,
  options: MountPlatformUsersModuleOptions = {},
): PlatformUsersModuleHandles {
  if (!options.platform) {
    throw new Error(
      "mountPlatformUsersModule requires options.platform (runtimePersistence.platform)",
    )
  }
  const platformRepos = options.platform
  const audit = new PlatformAuditService(platformRepos.platformAudit)
  const mfa = new PlatformMfaTotpService()
  const platformAuth = new PlatformAuthService(
    platformRepos.user,
    platformRepos.session,
    mfa,
    options.transactionalEmailService ?? null,
  )
  const platformUsers = new PlatformUsersService(
    platformRepos.user,
    audit,
    mfa,
    options.transactionalEmailService ?? null,
  )
  const resetTokens = platformRepos.passwordResetToken
  const platformPasswordReset = new PlatformPasswordResetService(
    platformRepos.user,
    resetTokens,
    platformRepos.session,
    options.transactionalEmailService ?? null,
  )

  app.use(
    "/v1/platform/auth",
    createPlatformAuthPublicRouter({ platformAuth, platformUsers, platformPasswordReset }),
  )
  const platformRouter = Router()
  platformRouter.use(platformAuthMiddleware(platformAuth))
  platformRouter.use(createPlatformUsersRouter(platformUsers))
  const ideaFeedbackService =
    options.productIdeaFeedbackService ??
    (options.feedback && options.projectRuntime
      ? createProductIdeaFeedbackEntryService({
          feedback: options.feedback,
          projectRuntime: options.projectRuntime,
        })
      : undefined)
  if (ideaFeedbackService) {
    mountProductIdeaFeedbackEntryPlatformRoutes(platformRouter, ideaFeedbackService)
  }
  const productFeedbackSvc =
    options.productFeedbackService ??
    (options.feedback && options.projectRuntime
      ? createProductFeedbackService({
          feedback: options.feedback,
          projectRuntime: options.projectRuntime,
        })
      : undefined)
  if (productFeedbackSvc) {
    mountProductFeedbackPlatformRoutes(platformRouter, productFeedbackSvc)
  }
  const workspaceLicense = requireInjected(options.workspaceLicense, "workspaceLicense")
  const tenantsDeps: PlatformTenantsModuleDeps = {
    tenant: platformRepos.tenant,
    catalog: platformRepos.catalog,
    metrics: platformRepos.metrics,
    license: workspaceLicense,
  }
  const prisma = getPrismaClient()
  mountPlatformTenantsRoutes(platformRouter, audit, tenantsDeps)
  mountPlatformBillingRoutes(platformRouter, audit, {
    catalog: platformRepos.catalog,
    tenant: platformRepos.tenant,
    license: workspaceLicense,
  })
  mountPlatformBillingOperationsRoutes(
    platformRouter,
    audit,
    options.paymentReceiptAccess ?? null,
    options.billing,
    options.workspaceMembers,
    platformRepos.catalog,
  )
  mountPlatformRegistrationPaddleRoutes(platformRouter, prisma)
  mountPlatformIdentityRegistrationIntentsRoutes(platformRouter, audit, prisma)
  mountPlatformLicensingRoutes(platformRouter, tenantsDeps)
  mountPlatformAuditRoutes(platformRouter, platformRepos.platformAuditQuery)
  mountPlatformObservabilityRoutes(platformRouter, tenantsDeps)
  if (options.workspaceInvitationService) {
    platformRouter.use(
      createPlatformWorkspaceInvitationsRouter(
        options.workspaceInvitationService,
        platformRepos.catalog,
      ),
    )
  }
  app.use("/v1/platform", platformRouter)

  return { platformUsersService: platformUsers, platformAuthService: platformAuth }
}
