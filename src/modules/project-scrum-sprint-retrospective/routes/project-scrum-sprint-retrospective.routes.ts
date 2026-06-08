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
  SprintRetrospectiveConflictError,
  SprintRetrospectiveNotFoundError,
  SprintRetrospectiveValidationError,
} from "../domain/sprint-retrospective.errors.js"
import {
  assertCanMutateSprintRetrospective,
  assertCanReadSprintRetrospective,
} from "../policies/sprint-retrospective.policy.js"
import type { SprintRetrospectiveService } from "../services/sprint-retrospective.service.js"
import { sprintRetrospectiveStateToJson } from "../services/sprint-retrospective.service.js"
import {
  createSprintRetrospectiveBodySchema,
  patchSprintRetrospectiveBodySchema,
  sprintRetrospectiveSprintParamsSchema,
} from "../validation/sprint-retrospective-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintRetrospectiveError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintRetrospectiveValidationError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      ...(err.zodIssues ? { issues: err.zodIssues } : {}),
    })
    return
  }
  if (err instanceof SprintRetrospectiveConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintRetrospectiveNotFoundError) {
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
export function createProjectScrumSprintRetrospectiveRouter(
  sprintRetrospectiveService: SprintRetrospectiveService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:sprintPublicId/retrospective", async (req, res, next) => {
    try {
      const parsed = sprintRetrospectiveSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintRetrospective(actor)
      const envelope = await sprintRetrospectiveService.getRetrospectiveEnvelope(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.status(200).json({
        retrospective: envelope.retrospective
          ? sprintRetrospectiveStateToJson(envelope.retrospective)
          : null,
      })
    } catch (err) {
      respondSprintRetrospectiveError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/retrospective", async (req, res, next) => {
    try {
      const parsedParams = sprintRetrospectiveSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = createSprintRetrospectiveBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({
          error: "invalid_body",
          issues: parsedBody.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintRetrospective(actor)
      const retrospective = await sprintRetrospectiveService.createRetrospective(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        actor.userPublicId,
        parsedBody.data,
      )
      res.status(201).json({ retrospective: sprintRetrospectiveStateToJson(retrospective) })
    } catch (err) {
      respondSprintRetrospectiveError(err, res, next)
    }
  })

  router.patch("/:sprintPublicId/retrospective", async (req, res, next) => {
    try {
      const parsedParams = sprintRetrospectiveSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = patchSprintRetrospectiveBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({
          error: "invalid_body",
          issues: parsedBody.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintRetrospective(actor)
      const retrospective = await sprintRetrospectiveService.patchRetrospective(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        actor.userPublicId,
        parsedBody.data,
      )
      res.status(200).json({ retrospective: sprintRetrospectiveStateToJson(retrospective) })
    } catch (err) {
      respondSprintRetrospectiveError(err, res, next)
    }
  })

  return router
}
