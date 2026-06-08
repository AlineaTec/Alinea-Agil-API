import type { NextFunction, Response, Router } from "express"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  ScrumBacklogForbiddenError,
  ScrumBacklogNotFoundError,
  ScrumBacklogValidationError,
} from "../../project-scrum-backlog/domain/scrum-backlog.errors.js"
import { scrumBacklogItemPathParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"
import type { WorkItemAssignmentHistoryEvent } from "../domain/work-item-assignment-history-event.js"
import {
  WorkItemAssignmentConflictError,
  WorkItemAssignmentForbiddenError,
  WorkItemAssignmentNotFoundError,
  WorkItemAssignmentValidationError,
} from "../domain/work-item-assignment.errors.js"
import { ProjectWorkAssignmentError } from "../domain/project-work-assignment.errors.js"
import type { WorkItemAssignmentService } from "../services/work-item-assignment.service.js"
import {
  assignWorkItemBodySchema,
  patchWorkItemAssignmentBodySchema,
} from "../validation/work-item-assignment-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function historyEventToJson(e: WorkItemAssignmentHistoryEvent) {
  return {
    assignmentEventId: e.assignmentEventId,
    changedAt: e.changedAt.toISOString(),
    changedByUserPublicId: e.changedByUserPublicId,
    previousAssignedUserPublicId: e.previousAssignedUserPublicId,
    newAssignedUserPublicId: e.newAssignedUserPublicId,
    changeType: e.changeType,
  }
}

function snapshotToJson(s: {
  assignedUserPublicId: string | null
  assignmentUpdatedAt: Date | null
  assignmentUpdatedByUserPublicId: string | null
}) {
  return {
    assignedUserPublicId: s.assignedUserPublicId,
    assignmentUpdatedAt: s.assignmentUpdatedAt ? s.assignmentUpdatedAt.toISOString() : null,
    assignmentUpdatedByUserPublicId: s.assignmentUpdatedByUserPublicId,
  }
}

export function respondWorkItemAssignmentError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ProjectWorkAssignmentError) {
    res.status(422).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemAssignmentForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemAssignmentValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemAssignmentNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemAssignmentConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
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
 * Rutas bajo el router del Scrum backlog (mismo `mergeParams`).
 * Prefijo lógico: `/items/:backlogItemPublicId/assignment`.
 */
export function attachWorkItemAssignmentRoutes(
  router: Router,
  workItemAssignmentService: WorkItemAssignmentService,
): void {
  router.get("/items/:backlogItemPublicId/assignment/history", async (req, res, next) => {
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
      const events = await workItemAssignmentService.listWorkItemAssignmentHistory(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ events: events.map(historyEventToJson) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.get("/items/:backlogItemPublicId/assignment", async (req, res, next) => {
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
      const snapshot = await workItemAssignmentService.getWorkItemAssignment(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId/assignment", async (req, res, next) => {
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
      const body = patchWorkItemAssignmentBodySchema.safeParse(req.body)
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
      const snapshot = await workItemAssignmentService.patchWorkItemAssignment(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.assigneeUserPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/assignment", async (req, res, next) => {
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
      const body = assignWorkItemBodySchema.safeParse(req.body)
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
      const snapshot = await workItemAssignmentService.assignWorkItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.assignedUserPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.delete("/items/:backlogItemPublicId/assignment", async (req, res, next) => {
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
      const snapshot = await workItemAssignmentService.unassignWorkItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/assignment/self", async (req, res, next) => {
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
      const snapshot = await workItemAssignmentService.selfAssignWorkItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })

  router.delete("/items/:backlogItemPublicId/assignment/self", async (req, res, next) => {
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
      const snapshot = await workItemAssignmentService.selfUnassignWorkItem(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
      )
      res.status(200).json({ assignment: snapshotToJson(snapshot) })
    } catch (err) {
      respondWorkItemAssignmentError(err, res, next)
    }
  })
}
