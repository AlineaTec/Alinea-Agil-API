import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  ProjectRuntimeForbiddenError,
  ProjectRuntimeInvalidInputError,
  ProjectRuntimeNotFoundError,
} from "../domain/project-runtime.errors.js"
import type { ProjectDraftService } from "../../workspace-projects/services/project-draft.service.js"
import type { ProjectRuntimeService } from "../services/project-runtime.service.js"
import type { DeveloperHoursReportService } from "../services/developer-hours-report.service.js"
import type { AlignmentSessionsReportService } from "../services/alignment-sessions-report.service.js"
import type { GuidedRefinementSessionsReportService } from "../services/guided-refinement-sessions-report.service.js"
import type { GuidedReviewSessionsReportService } from "../services/guided-review-sessions-report.service.js"
import type { GuidedRetrospectiveSessionsReportService } from "../services/guided-retrospective-sessions-report.service.js"
import type { GuidedSprintPlanningSessionsReportService } from "../services/guided-sprint-planning-sessions-report.service.js"
import {
  workspaceProjectRuntimePathParamsSchema,
  workspaceProjectRuntimeWorkspaceOnlyParamsSchema,
} from "../validation/workspace-project-runtime-http.schemas.js"
import { developerHoursReportQuerySchema } from "../validation/developer-hours-report-http.schemas.js"
import { alignmentSessionsReportQuerySchema } from "../validation/alignment-sessions-report-http.schemas.js"
import { guidedRefinementSessionsReportQuerySchema } from "../validation/guided-refinement-sessions-report-http.schemas.js"
import { guidedReviewSessionsReportQuerySchema } from "../validation/guided-review-sessions-report-http.schemas.js"
import { guidedRetrospectiveSessionsReportQuerySchema } from "../validation/guided-retrospective-sessions-report-http.schemas.js"
import { guidedSprintPlanningSessionsReportQuerySchema } from "../validation/guided-sprint-planning-sessions-report-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondRuntimeError(err: unknown, res: Response, next: NextFunction): void {
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
 * Rutas bajo `/v1/workspaces/:workspacePublicId/projects` (recurso operativo, no drafts).
 */
export function createWorkspaceProjectRuntimeRouter(
  projectRuntimeService: ProjectRuntimeService,
  projectDraftService: ProjectDraftService,
  developerHoursReportService: DeveloperHoursReportService,
  alignmentSessionsReportService: AlignmentSessionsReportService,
  guidedRefinementSessionsReportService: GuidedRefinementSessionsReportService,
  guidedReviewSessionsReportService: GuidedReviewSessionsReportService,
  guidedRetrospectiveSessionsReportService: GuidedRetrospectiveSessionsReportService,
  guidedSprintPlanningSessionsReportService: GuidedSprintPlanningSessionsReportService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimeWorkspaceOnlyParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const { workspacePublicId } = parsed.data
      const actor = getRequiredActor(res)
      const projects = await projectRuntimeService.listWorkspaceRuntimeProjectsForWorkspace(
        actor,
        workspacePublicId,
      )
      const draftIds = [...new Set(projects.map((p) => p.sourceDraftPublicId))]
      const charterByDraft = await projectDraftService.getCharterSnapshotsByDraftIds(
        workspacePublicId,
        draftIds,
      )
      const projectsWithCharter = projects.map((p) => ({
        ...p,
        charterSummary: charterByDraft.get(p.sourceDraftPublicId) ?? null,
      }))
      res.status(200).json({ projects: projectsWithCharter })
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/developer-hours-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = developerHoursReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<DeveloperHoursReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await developerHoursReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await developerHoursReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/alignment-sessions-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = alignmentSessionsReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<AlignmentSessionsReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await alignmentSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await alignmentSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/guided-refinement-sessions-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = guidedRefinementSessionsReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<GuidedRefinementSessionsReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await guidedRefinementSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await guidedRefinementSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/guided-review-sessions-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = guidedReviewSessionsReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<GuidedReviewSessionsReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await guidedReviewSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await guidedReviewSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/guided-retrospective-sessions-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = guidedRetrospectiveSessionsReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<GuidedRetrospectiveSessionsReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await guidedRetrospectiveSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await guidedRetrospectiveSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/guided-sprint-planning-sessions-report", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }
      const q = guidedSprintPlanningSessionsReportQuerySchema.safeParse(req.query)
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
      let body: Awaited<ReturnType<GuidedSprintPlanningSessionsReportService["getReport"]>>
      if (q.data.sprintPublicId !== undefined && q.data.sprintPublicId.length > 0) {
        body = await guidedSprintPlanningSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          sprintPublicId: q.data.sprintPublicId,
        })
      } else {
        body = await guidedSprintPlanningSessionsReportService.getReport(actor, workspacePublicId, projectPublicId, {
          dateFrom: q.data.dateFrom!,
          dateTo: q.data.dateTo!,
        })
      }
      res.status(200).json(body)
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  router.get("/:projectPublicId/summary", async (req, res, next) => {
    try {
      const parsed = workspaceProjectRuntimePathParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({
          error: "invalid_path_params",
          message: "Invalid workspace or project id.",
          details: parsed.error.flatten(),
        })
        return
      }

      const { workspacePublicId, projectPublicId } = parsed.data
      const actor = getRequiredActor(res)
      const summary = await projectRuntimeService.getProjectRuntimeSummary(
        actor,
        workspacePublicId,
        projectPublicId,
      )
      const charterByDraft = await projectDraftService.getCharterSnapshotsByDraftIds(
        workspacePublicId,
        [summary.sourceDraftPublicId],
      )
      res.status(200).json({
        ...summary,
        charterSummary: charterByDraft.get(summary.sourceDraftPublicId) ?? null,
      })
    } catch (err) {
      respondRuntimeError(err, res, next)
    }
  })

  return router
}
