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
import { acceptanceCriteriaSummary } from "../domain/acceptance-criterion.js"
import type { AcceptanceCriterionState } from "../domain/acceptance-criterion.js"
import type { ScrumBacklogItemState } from "../domain/scrum-backlog-item.js"
import {
  ScrumBacklogForbiddenError,
  ScrumBacklogNotFoundError,
  ScrumBacklogValidationError,
} from "../domain/scrum-backlog.errors.js"
import { attachWorkItemAssignmentRoutes } from "../../work-item-assignment/routes/work-item-assignment.routes.js"
import type { WorkItemAssignmentService } from "../../work-item-assignment/services/work-item-assignment.service.js"
import { attachWorkItemCommentsRoutes } from "../../work-item-comments/routes/work-item-comments.routes.js"
import type { WorkItemCommentsService } from "../../work-item-comments/services/work-item-comments.service.js"
import { attachWorkItemTimeEntriesRoutes } from "../../work-item-time-logging/routes/work-item-time-entries.routes.js"
import type { WorkItemTimeEntriesService } from "../../work-item-time-logging/services/work-item-time-entries.service.js"
import type { ScrumCarryoverDerivationService } from "../../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import {
  emptyScrumCarryoverJsonFields,
  type ScrumCarryoverJsonFields,
} from "../../project-scrum-carryover/domain/scrum-carryover-fields.js"
import type { ScrumBacklogService } from "../services/scrum-backlog.service.js"
import { getWorkControlOverrideTokenFromRequest } from "../../work-ready-done-controls/utils/work-controls-http.util.js"
import {
  WorkControlsBlockedError,
  WorkControlsValidationError,
} from "../../work-ready-done-controls/domain/work-ready-done-controls.errors.js"
import {
  createScrumBacklogItemBodySchema,
  moveScrumBacklogItemBodySchema,
  patchScrumBacklogItemBodySchema,
  scrumBacklogItemPathParamsSchema,
  scrumBacklogItemsListQuerySchema,
  scrumBacklogMountParamsSchema,
} from "../validation/project-scrum-backlog-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function acceptanceCriterionToJson(c: AcceptanceCriterionState) {
  return {
    acceptanceCriterionPublicId: c.acceptanceCriterionPublicId,
    text: c.text,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

function itemToJson(s: ScrumBacklogItemState, carry: ScrumCarryoverJsonFields) {
  const c = carry
  return {
    backlogItemPublicId: s.backlogItemPublicId,
    workspacePublicId: s.workspacePublicId,
    projectPublicId: s.projectPublicId,
    itemType: s.itemType,
    title: s.title,
    description: s.description,
    status: s.status,
    sortOrder: s.sortOrder,
    parentItemPublicId: s.parentItemPublicId,
    createdByUserPublicId: s.createdByUserPublicId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    completedInSprintPublicId: s.completedInSprintPublicId,
    assignedUserPublicId: s.assignedUserPublicId,
    assignmentUpdatedAt: s.assignmentUpdatedAt ? s.assignmentUpdatedAt.toISOString() : null,
    assignmentUpdatedByUserPublicId: s.assignmentUpdatedByUserPublicId,
    isCarryover: c.isCarryover,
    lastNotCompletedSprintPublicId: c.lastNotCompletedSprintPublicId,
    lastNotCompletedSprintName: c.lastNotCompletedSprintName,
    lastNotCompletedClosedAt: c.lastNotCompletedClosedAt,
    storyPoints: s.storyPoints,
    priorityLevel: s.priorityLevel,
    acceptanceCriteria: s.acceptanceCriteria.map(acceptanceCriterionToJson),
    acceptanceCriteriaSummary: acceptanceCriteriaSummary(s.acceptanceCriteria),
    commentsCount: s.commentsCount,
  }
}

function respondScrumBacklogError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ScrumBacklogForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogNotFoundError) {
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
  if (err instanceof WorkControlsBlockedError) {
    res.status(409).json({
      error: err.code,
      message: err.message,
      work_controls: err.payload,
    })
    return
  }
  if (err instanceof WorkControlsValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
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
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-backlog`.
 */
export function createProjectScrumBacklogRouter(
  scrumBacklogService: ScrumBacklogService,
  workItemAssignmentService: WorkItemAssignmentService,
  workItemCommentsService: WorkItemCommentsService,
  workItemTimeEntriesService: WorkItemTimeEntriesService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  carryoverDerivationService: ScrumCarryoverDerivationService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  attachWorkItemAssignmentRoutes(router, workItemAssignmentService)
  attachWorkItemCommentsRoutes(router, workItemCommentsService)
  attachWorkItemTimeEntriesRoutes(router, workItemTimeEntriesService)

  router.get("/items", async (req, res, next) => {
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
      const q = scrumBacklogItemsListQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: q.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const f = q.data
      const assignmentFilter =
        f.unassigned === "true" || f.assignee || f.assigneeUserPublicId
          ? {
              unassigned: f.unassigned === "true" ? true : undefined,
              assignee: f.assignee,
              assigneeUserPublicId: f.assigneeUserPublicId,
            }
          : undefined
      const items = await scrumBacklogService.listBacklogItems(
        actor,
        workspacePublicId,
        projectPublicId,
        assignmentFilter,
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        workspacePublicId,
        projectPublicId,
        items.map((i) => i.backlogItemPublicId),
      )
      res.status(200).json({
        items: items.map((i) =>
          itemToJson(i, carryMap.get(i.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields()),
        ),
      })
    } catch (err) {
      respondScrumBacklogError(err, res, next)
    }
  })

  router.post("/items", async (req, res, next) => {
    try {
      const parsedParams = scrumBacklogMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createScrumBacklogItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const created = await scrumBacklogService.createBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        body.data,
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        workspacePublicId,
        projectPublicId,
        [created.backlogItemPublicId],
      )
      res.status(201).json({
        item: itemToJson(
          created,
          carryMap.get(created.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields(),
        ),
      })
    } catch (err) {
      respondScrumBacklogError(err, res, next)
    }
  })

  router.get("/items/:backlogItemPublicId", async (req, res, next: NextFunction) => {
    try {
      const parsed = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const item = await scrumBacklogService.getBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        workspacePublicId,
        projectPublicId,
        [item.backlogItemPublicId],
      )
      res.status(200).json({
        item: itemToJson(item, carryMap.get(item.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields()),
      })
    } catch (err) {
      respondScrumBacklogError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/move", async (req, res, next: NextFunction) => {
    try {
      const parsed = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = moveScrumBacklogItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const result = await scrumBacklogService.moveBacklogItemRelative(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.direction,
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        workspacePublicId,
        projectPublicId,
        [result.item.backlogItemPublicId],
      )
      res.status(200).json({
        item: itemToJson(
          result.item,
          carryMap.get(result.item.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields(),
        ),
        moved: result.moved,
      })
    } catch (err) {
      respondScrumBacklogError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId", async (req, res, next: NextFunction) => {
    try {
      const parsed = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsed.error.flatten(),
        })
        return
      }
      const body = patchScrumBacklogItemBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const overrideToken = getWorkControlOverrideTokenFromRequest(req)
      const updated = await scrumBacklogService.updateBacklogItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data,
        { workControlOverrideToken: overrideToken },
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        workspacePublicId,
        projectPublicId,
        [updated.backlogItemPublicId],
      )
      res.status(200).json({
        item: itemToJson(
          updated,
          carryMap.get(updated.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields(),
        ),
      })
    } catch (err) {
      respondScrumBacklogError(err, res, next)
    }
  })

  return router
}
