import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { ScrumBacklogForbiddenError } from "../../project-scrum-backlog/domain/scrum-backlog.errors.js"
import { SprintBoardForbiddenError } from "../../project-scrum-sprint-board/domain/sprint-board.errors.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import {
  SprintPlanningNotFoundError,
  SprintPlanningValidationError,
} from "../domain/sprint-planning.errors.js"
import {
  emptyScrumCarryoverJsonFields,
} from "../../project-scrum-carryover/domain/scrum-carryover-fields.js"
import type { ScrumCarryoverDerivationService } from "../../project-scrum-carryover/services/scrum-carryover-derivation.service.js"
import {
  assertCanMutateSprintPlanning,
  assertCanReadSprintPlanning,
} from "../policies/sprint-planning-authorization.policy.js"
import type { SprintPlanningService } from "../services/sprint-planning.service.js"
import { sprintStateToJson } from "../services/sprint-planning.service.js"
import { getWorkControlOverrideTokenFromRequest } from "../../work-ready-done-controls/utils/work-controls-http.util.js"
import {
  WorkControlsBlockedError,
  WorkControlsValidationError,
} from "../../work-ready-done-controls/domain/work-ready-done-controls.errors.js"
import {
  availableCommitItemsQuerySchema,
  commitBacklogItemBodySchema,
  createScrumSprintBodySchema,
  patchScrumSprintBodySchema,
  sprintPlanningItemParamsSchema,
  sprintPlanningMountParamsSchema,
  sprintPlanningSprintParamsSchema,
} from "../validation/sprint-planning-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondSprintPlanningError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof SprintPlanningValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintPlanningNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ScrumBacklogForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof SprintBoardForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
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
 * Montado en `/v1/workspaces/:workspacePublicId/projects/:projectPublicId/scrum-sprints`.
 */
export function createProjectScrumSprintPlanningRouter(
  sprintPlanningService: SprintPlanningService,
  carryoverDerivationService: ScrumCarryoverDerivationService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const parsed = sprintPlanningMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintPlanning(actor)
      const rows = await sprintPlanningService.listSprints(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
      )
      res.json({ sprints: rows.map(sprintStateToJson) })
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.post("/", async (req, res, next) => {
    try {
      const parsedParams = sprintPlanningMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = createScrumSprintBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({ error: "invalid_body", issues: parsedBody.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      const created = await sprintPlanningService.createSprint(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        actor.userPublicId,
        parsedBody.data,
      )
      res.status(201).json(sprintStateToJson(created))
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.get("/:sprintPublicId", async (req, res, next) => {
    try {
      const parsed = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintPlanning(actor)
      const s = await sprintPlanningService.getSprint(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.json(sprintStateToJson(s))
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.patch("/:sprintPublicId", async (req, res, next) => {
    try {
      const parsedParams = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = patchScrumSprintBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({ error: "invalid_body", issues: parsedBody.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      const updated = await sprintPlanningService.updateSprint(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        parsedBody.data,
      )
      res.json(sprintStateToJson(updated))
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/ready", async (req, res, next) => {
    try {
      const parsed = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      const updated = await sprintPlanningService.markSprintReadyForExecution(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.json(sprintStateToJson(updated))
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/revert-to-planning", async (req, res, next) => {
    try {
      const parsed = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      const updated = await sprintPlanningService.revertSprintToPlanning(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      res.json(sprintStateToJson(updated))
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.get("/:sprintPublicId/available-commit-items", async (req, res, next) => {
    try {
      const parsed = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const q = availableCommitItemsQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", issues: q.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintPlanning(actor)
      const result = await sprintPlanningService.listAvailableCommitItems(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
        {
          q: q.data.q,
          page: q.data.page ?? 1,
          pageSize: q.data.pageSize ?? 50,
        },
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        result.items.map((i) => i.backlogItemPublicId),
      )
      res.json({
        items: result.items.map((item) => {
          const carry = carryMap.get(item.backlogItemPublicId) ?? emptyScrumCarryoverJsonFields()
          return {
            ...item,
            isCarryover: carry.isCarryover,
            lastNotCompletedSprintPublicId: carry.lastNotCompletedSprintPublicId,
            lastNotCompletedSprintName: carry.lastNotCompletedSprintName,
            lastNotCompletedClosedAt: carry.lastNotCompletedClosedAt,
          }
        }),
        pagination: {
          total: result.total,
          page: q.data.page ?? 1,
          pageSize: q.data.pageSize ?? 50,
          hasNextPage: result.hasNextPage,
        },
      })
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.get("/:sprintPublicId/items", async (req, res, next) => {
    try {
      const parsed = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanReadSprintPlanning(actor)
      const rows = await sprintPlanningService.listCommittedItems(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
      )
      const carryMap = await carryoverDerivationService.deriveForBacklogItems(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        rows.map((r) => r.membership.backlogItemPublicId),
      )
      res.json({
        items: rows.map((r) => {
          const id = r.membership.backlogItemPublicId
          const carry = carryMap.get(id) ?? emptyScrumCarryoverJsonFields()
          return {
            sprintPublicId: r.membership.sprintPublicId,
            backlogItemPublicId: r.membership.backlogItemPublicId,
            workspacePublicId: r.membership.workspacePublicId,
            projectPublicId: r.membership.projectPublicId,
            sprintSortOrder: r.membership.sprintSortOrder,
            boardColumn: r.membership.boardColumn,
            committedAt: r.membership.committedAt.toISOString(),
            committedByUserPublicId: r.membership.committedByUserPublicId,
            backlogItem: {
              ...r.backlogItem,
              acceptanceCriteriaSummary: r.backlogItem.acceptanceCriteriaSummary,
              isCarryover: carry.isCarryover,
              lastNotCompletedSprintPublicId: carry.lastNotCompletedSprintPublicId,
              lastNotCompletedSprintName: carry.lastNotCompletedSprintName,
              lastNotCompletedClosedAt: carry.lastNotCompletedClosedAt,
            },
          }
        }),
      })
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.post("/:sprintPublicId/items", async (req, res, next) => {
    try {
      const parsedParams = sprintPlanningSprintParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_params", issues: parsedParams.error.flatten() })
        return
      }
      const parsedBody = commitBacklogItemBodySchema.safeParse(req.body ?? {})
      if (!parsedBody.success) {
        res.status(400).json({ error: "invalid_body", issues: parsedBody.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      const m = await sprintPlanningService.commitBacklogItemToSprint(
        parsedParams.data.workspacePublicId,
        parsedParams.data.projectPublicId,
        parsedParams.data.sprintPublicId,
        parsedBody.data.backlogItemPublicId,
        actor,
        { workControlOverrideToken: getWorkControlOverrideTokenFromRequest(req) },
      )
      res.status(201).json({
        sprintPublicId: m.sprintPublicId,
        backlogItemPublicId: m.backlogItemPublicId,
        workspacePublicId: m.workspacePublicId,
        projectPublicId: m.projectPublicId,
        sprintSortOrder: m.sprintSortOrder,
        boardColumn: m.boardColumn,
        committedAt: m.committedAt.toISOString(),
        committedByUserPublicId: m.committedByUserPublicId,
      })
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  router.delete("/:sprintPublicId/items/:backlogItemPublicId", async (req, res, next) => {
    try {
      const parsed = sprintPlanningItemParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_params", issues: parsed.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      assertCanMutateSprintPlanning(actor)
      await sprintPlanningService.removeBacklogItemFromSprint(
        parsed.data.workspacePublicId,
        parsed.data.projectPublicId,
        parsed.data.sprintPublicId,
        parsed.data.backlogItemPublicId,
        actor,
      )
      res.status(204).send()
    } catch (err) {
      respondSprintPlanningError(err, res, next)
    }
  })

  return router
}
