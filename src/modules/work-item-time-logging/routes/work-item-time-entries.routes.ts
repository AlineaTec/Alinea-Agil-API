import { Router, type NextFunction, type Response } from "express"
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
import { SprintBoardForbiddenError } from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { scrumBacklogItemPathParamsSchema } from "../../project-scrum-backlog/validation/project-scrum-backlog-http.schemas.js"
import type { WorkItemTimeEntryState } from "../domain/work-item-time-entry.js"
import {
  WorkItemTimeEntriesForbiddenError,
  WorkItemTimeEntriesNotFoundError,
  WorkItemTimeEntriesValidationError,
} from "../domain/work-item-time-logging.errors.js"
import {
  assertCanDeleteTimeEntry,
  assertCanUpdateTimeEntry,
} from "../policies/work-item-time-entries-authorization.policy.js"
import type { WorkItemTimeEntriesService } from "../services/work-item-time-entries.service.js"
import {
  createTimeEntryBodySchema,
  listTimeEntriesQuerySchema,
  patchTimeEntryBodySchema,
  workItemTimeEntryPathParamsSchema,
} from "../validation/work-item-time-entries-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function tryPolicy(fn: () => void): boolean {
  try {
    fn()
    return true
  } catch {
    return false
  }
}

function timeEntryToJson(
  e: WorkItemTimeEntryState,
  actor: WorkspaceMemberState,
  opts?: { isAuthoredByActor: boolean; canUpdate: boolean; canDelete: boolean },
) {
  const isAuthoredByActor = opts?.isAuthoredByActor ?? e.createdByUserPublicId === actor.userPublicId
  const canUpdate = opts?.canUpdate ?? tryPolicy(() => assertCanUpdateTimeEntry(actor, isAuthoredByActor))
  const canDelete = opts?.canDelete ?? tryPolicy(() => assertCanDeleteTimeEntry(actor, isAuthoredByActor))
  return {
    timeEntryPublicId: e.timeEntryPublicId,
    workspacePublicId: e.workspacePublicId,
    projectPublicId: e.projectPublicId,
    workItemPublicId: e.backlogItemPublicId,
    userPublicId: e.userPublicId,
    minutesSpent: e.minutesSpent,
    workDate: e.workDate.toISOString().slice(0, 10),
    note: e.note,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    createdByUserPublicId: e.createdByUserPublicId,
    updatedByUserPublicId: e.updatedByUserPublicId,
    isAuthoredByActor,
    canUpdate,
    canDelete,
  }
}

export function respondWorkItemTimeEntriesError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkItemTimeEntriesForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemTimeEntriesValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkItemTimeEntriesNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
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
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
 * Rutas bajo el router de backlog: `/items/:backlogItemPublicId/time-entries`.
 */
export function attachWorkItemTimeEntriesRoutes(
  router: Router,
  workItemTimeEntriesService: WorkItemTimeEntriesService,
): void {
  router.get("/items/:backlogItemPublicId/time-entries", async (req, res, next) => {
    try {
      const parsedParams = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const q = listTimeEntriesQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({
          error: "invalid_query",
          message: "Invalid query parameters.",
          details: q.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const { timeEntries, nextCursor, summary } = await workItemTimeEntriesService.listTimeEntries(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        q.data.limit,
        q.data.cursor,
      )
      res.status(200).json({
        timeEntries: timeEntries.map((e) => timeEntryToJson(e, actor)),
        summary: {
          workItemPublicId: summary.workItemPublicId,
          totalLoggedMinutes: summary.totalLoggedMinutes,
          entryCount: summary.entryCount,
          lastLoggedAt: summary.lastLoggedAt ? summary.lastLoggedAt.toISOString() : null,
          lastTimeEntryByUserPublicId: summary.lastTimeEntryByUserPublicId,
        },
        projectPublicId,
        nextCursor,
      })
    } catch (err) {
      respondWorkItemTimeEntriesError(err, res, next)
    }
  })

  router.post("/items/:backlogItemPublicId/time-entries", async (req, res, next) => {
    try {
      const parsedParams = scrumBacklogItemPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = createTimeEntryBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const created = await workItemTimeEntriesService.createTimeEntry(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        body.data.minutesSpent,
        body.data.workDate,
        body.data.note,
      )
      res.status(201).json({ timeEntry: timeEntryToJson(created, actor) })
    } catch (err) {
      respondWorkItemTimeEntriesError(err, res, next)
    }
  })

  router.patch("/items/:backlogItemPublicId/time-entries/:timeEntryPublicId", async (req, res, next) => {
    try {
      const parsedParams = workItemTimeEntryPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const body = patchTimeEntryBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({
          error: "invalid_body",
          message: "Invalid request body.",
          details: body.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId, timeEntryPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      const updated = await workItemTimeEntriesService.patchTimeEntry(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        timeEntryPublicId,
        body.data,
      )
      res.status(200).json({ timeEntry: timeEntryToJson(updated, actor) })
    } catch (err) {
      respondWorkItemTimeEntriesError(err, res, next)
    }
  })

  router.delete("/items/:backlogItemPublicId/time-entries/:timeEntryPublicId", async (req, res, next) => {
    try {
      const parsedParams = workItemTimeEntryPathParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid path parameters.",
          details: parsedParams.error.flatten(),
        })
        return
      }
      const { workspacePublicId, projectPublicId, backlogItemPublicId, timeEntryPublicId } = parsedParams.data
      const actor = getRequiredActor(res)
      await workItemTimeEntriesService.deleteTimeEntry(
        actor,
        workspacePublicId,
        projectPublicId,
        backlogItemPublicId,
        timeEntryPublicId,
      )
      res.status(204).send()
    } catch (err) {
      respondWorkItemTimeEntriesError(err, res, next)
    }
  })
}
