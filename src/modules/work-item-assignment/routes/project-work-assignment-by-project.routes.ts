import type { Express, NextFunction, RequestHandler, Response } from "express"
import { Router } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  projectWorkItemAssignmentPathParamsSchema,
  scrumBacklogMountParamsSchema,
} from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"
import type { WorkItemAssignmentService } from "../services/work-item-assignment.service.js"
import { patchWorkItemAssignmentBodySchema } from "../validation/work-item-assignment-http.schemas.js"
import { respondWorkItemAssignmentError } from "./work-item-assignment.routes.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

/**
 * Debe montarse en `app` **antes** que `mountWorkspaceProjectRuntimeModule` (mismo criterio que equipos por proyecto).
 *
 * - `GET /:projectPublicId/assignables`
 * - `PATCH /:projectPublicId/work-items/:workItemPublicId/assignment`
 */
export function createProjectWorkAssignmentByProjectRouter(
  workItemAssignmentService: WorkItemAssignmentService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/:projectPublicId/assignables", async (req, res, next: NextFunction) => {
    try {
      const parsed = scrumBacklogMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const actor = getRequiredActor(res)
      const { workspacePublicId, projectPublicId } = parsed.data
      const result = await workItemAssignmentService.listProjectAssignables(
        actor,
        workspacePublicId,
        projectPublicId,
      )
      res.status(200).json({
        workspacePublicId,
        projectPublicId,
        projectTeamLinkCount: result.projectTeamLinkCount,
        members: result.members,
      })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.patch("/:projectPublicId/work-items/:workItemPublicId/assignment", async (req, res, next: NextFunction) => {
    try {
      const parsed = projectWorkItemAssignmentPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = patchWorkItemAssignmentBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, workItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const snapshot = await workItemAssignmentService.patchWorkItemAssignment(
        actor,
        workspacePublicId,
        projectPublicId,
        workItemPublicId,
        body.data.assigneeUserPublicId,
      )
      res.status(200).json({
        assignment: {
          assignedUserPublicId: snapshot.assignedUserPublicId,
          assignmentUpdatedAt: snapshot.assignmentUpdatedAt ? snapshot.assignmentUpdatedAt.toISOString() : null,
          assignmentUpdatedByUserPublicId: snapshot.assignmentUpdatedByUserPublicId,
        },
      })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  return router
}

export function mountProjectWorkAssignmentByProjectRoutesFirst(
  app: Express,
  options: {
    workItemAssignmentService: WorkItemAssignmentService
    authBearerService: AuthBearerService
    workspaceUserService: WorkspaceUserService
    billingPrimaryProductMutationGate: RequestHandler
  },
): void {
  app.use(
    "/v1/workspaces/:workspacePublicId/projects",
    createProjectWorkAssignmentByProjectRouter(
      options.workItemAssignmentService,
      options.authBearerService,
      options.workspaceUserService,
      options.billingPrimaryProductMutationGate,
    ),
  )
}
