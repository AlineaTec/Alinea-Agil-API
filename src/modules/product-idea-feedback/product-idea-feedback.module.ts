import type { Express, RequestHandler, Router } from "express"
import type { FeedbackRepositories } from "../../infrastructure/persistence/feedback-repositories.factory.js"
import { createFeedbackRepositories } from "../../infrastructure/persistence/feedback-repositories.factory.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createWorkspaceRuntimeProjectLookup } from "./persistence/workspace-runtime-project-lookup.factory.js"
import { ProductIdeaFeedbackEntryService } from "./services/product-idea-feedback.service.js"
import { createProductIdeaFeedbackEntryWorkspaceRouter } from "./routes/product-idea-feedback.workspace.routes.js"
import { createProductIdeaFeedbackEntryPlatformRouter } from "./routes/product-idea-feedback.platform.routes.js"

export { ProductIdeaFeedbackEntryService } from "./services/product-idea-feedback.service.js"
export { isProductIdeaFeedbackEntryError } from "./services/product-idea-feedback.service.js"

export type CreateProductIdeaFeedbackEntryServiceOptions = {
  feedback?: FeedbackRepositories
  projectRuntime?: ProjectRuntimeRepository
}

export function createProductIdeaFeedbackEntryService(
  options: CreateProductIdeaFeedbackEntryServiceOptions = {},
): ProductIdeaFeedbackEntryService {
  const feedback = options.feedback ?? createFeedbackRepositories()
  const projectRuntime = options.projectRuntime
  if (!projectRuntime) {
    throw new Error(
      "createProductIdeaFeedbackEntryService requires projectRuntime (inject runtimePersistence.projects.runtime)",
    )
  }
  return new ProductIdeaFeedbackEntryService(
    feedback.productIdea,
    feedback.productIdeaFeedbackEntry,
    feedback.productIdeaFeedbackAudit,
    createWorkspaceRuntimeProjectLookup(projectRuntime),
  )
}

export type MountProductIdeaFeedbackEntryWorkspaceOptions = {
  service: ProductIdeaFeedbackEntryService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

/**
 * `web`: `GET /v1/workspaces/:workspacePublicId/product-ideas` (catálogo) y
 * `.../product-ideas/:ideaPublicId/feedback/...` (elegibilidad y envío).
 */
export function mountProductIdeaFeedbackEntryWorkspaceModule(
  app: Express,
  options: MountProductIdeaFeedbackEntryWorkspaceOptions,
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/product-ideas",
    createProductIdeaFeedbackEntryWorkspaceRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

/**
 * `admin` (plataforma): bajo el router ya prefijado `/v1/platform` — montar **antes** de `app.use` final.
 */
export function mountProductIdeaFeedbackEntryPlatformRoutes(
  platformRouter: Router,
  service: ProductIdeaFeedbackEntryService,
): void {
  platformRouter.use(createProductIdeaFeedbackEntryPlatformRouter(service))
}
