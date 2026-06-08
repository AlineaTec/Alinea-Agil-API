import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  SprintBoardForbiddenError,
  SprintBoardNotFoundError,
  SprintBoardValidationError,
} from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import {
  SprintReviewConflictError,
  SprintReviewNotFoundError,
  SprintReviewValidationError,
} from "../domain/sprint-review.errors.js"
import { assertCanMutateSprintReview, assertCanReadSprintReview } from "../policies/sprint-review.policy.js"
import type { SprintReviewService } from "../services/sprint-review.service.js"
import { sprintReviewStateToJson } from "../services/sprint-review.service.js"
import {
  createSprintReviewBodySchema,
  patchSprintReviewBodySchema,
  sprintReviewSprintParamsSchema,
} from "../validation/sprint-review-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintReviewError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintReviewValidationError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      ...(err.zodIssues ? { issues: err.zodIssues } : {}),
    })
    return
  }
  if (err instanceof SprintReviewConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintReviewNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeInvalidInputError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectRuntimeNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({
      error: "internal_error",
      message: "Workspace actor context missing after auth middleware.",
    })
    return
  }
  next(err)
}

/**
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`.
 */
export function createProjectScrumSprintReviewRouter(
  sprintReviewService: SprintReviewService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:sprintPublicId/review", async (req, res, next) => {
    try {
      const parsed = sprintReviewSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintReview(actor)
      const envelope = await sprintReviewService.getReviewEnvelope(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.status(200).json({
        review: envelope.review ? sprintReviewStateToJson(envelope.review) : null,
      })
    } catch (err) {
      respondSprintReviewError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/review", async (req, res, next) => {
    try {
      const parsedParams = sprintReviewSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = createSprintReviewBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({
          error: "invalid_body",
          issues: parsedBody.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintReview(actor)
      const review = await sprintReviewService.createReview(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        actor.userPublicId,
        parsedBody.data,
      )
      res.status(201).json({ review: sprintReviewStateToJson(review) })
    } catch (err) {
      respondSprintReviewError(err, res, next)
    }
  })

  router.patch("/:sprintPublicId/review", async (req, res, next) => {
    try {
      const parsedParams = sprintReviewSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = patchSprintReviewBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({
          error: "invalid_body",
          issues: parsedBody.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintReview(actor)
      const review = await sprintReviewService.patchReview(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        actor.userPublicId,
        parsedBody.data,
      )
      res.status(200).json({ review: sprintReviewStateToJson(review) })
    } catch (err) {
      respondSprintReviewError(err, res, next)
    }
  })

  return router
}
