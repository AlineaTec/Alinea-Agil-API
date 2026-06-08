import type { Express, RequestHandler, Router } from "express"
import type { FeedbackRepositories } from "../../infrastructure/persistence/feedback-repositories.factory.js"
import { createFeedbackRepositories } from "../../infrastructure/persistence/feedback-repositories.factory.js"
import type { ProjectRuntimeRepository } from "../workspace-project-runtime/persistence/project-runtime.repository.js"
import type { AuthBearerService } from "../login-session/services/auth-bearer.service.js"
import type { WorkspaceUserService } from "../workspace-users/services/workspace-user.service.js"
import { createWorkspaceRuntimeProjectLookup } from "../product-idea-feedback/persistence/workspace-runtime-project-lookup.factory.js"
import { ProductFeedbackService } from "./services/product-feedback.service.js"
import { createProductFeedbackMeRouter } from "./routes/product-feedback.me.routes.js"
import { createProductFeedbackPlatformRouter } from "./routes/product-feedback.platform.routes.js"

export { ProductFeedbackService } from "./services/product-feedback.service.js"
export { isProductFeedbackServiceError } from "./services/product-feedback.service.js"

export type CreateProductFeedbackServiceOptions = {
  feedback?: FeedbackRepositories
  projectRuntime?: ProjectRuntimeRepository
}

export function createProductFeedbackService(
  options: CreateProductFeedbackServiceOptions = {},
): ProductFeedbackService {
  const feedback = options.feedback ?? createFeedbackRepositories()
  const projectRuntime = options.projectRuntime
  if (!projectRuntime) {
    throw new Error(
      "createProductFeedbackService requires projectRuntime (inject runtimePersistence.projects.runtime)",
    )
  }
  return new ProductFeedbackService(
    feedback.productIdea,
    feedback.productFeedbackSubmission,
    feedback.productFeedbackAudit,
    createWorkspaceRuntimeProjectLookup(projectRuntime),
  )
}

export type MountProductFeedbackMeOptions = {
  service: ProductFeedbackService
  authBearerService: AuthBearerService
  workspaceUserService: WorkspaceUserService
  billingPrimaryProductMutationGate: RequestHandler
}

export function mountProductFeedbackMeModule(app: Express, options: MountProductFeedbackMeOptions): void {
  app.use(
    "/v1/me/product-feedback",
    createProductFeedbackMeRouter(
      options.service,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}

export function mountProductFeedbackPlatformRoutes(platformRouter: Router, service: ProductFeedbackService): void {
  platformRouter.use(createProductFeedbackPlatformRouter(service))
}
