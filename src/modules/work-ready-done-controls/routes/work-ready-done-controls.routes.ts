import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import {
  WorkControlsBlockedError,
  WorkControlsForbiddenError,
  WorkControlsNotFoundError,
  WorkControlsValidationError,
} from "../domain/work-ready-done-controls.errors.js"
import type { WorkControlCriterionConfig, WorkControlsProjectProfileState } from "../domain/work-ready-done-controls.dto.js"
import type { WorkControlEventCode } from "../domain/work-ready-done-controls.constants.js"
import {
  assertCanEvaluateWorkControls,
  assertCanIssueWorkControlsOverride,
  assertCanManageWorkControls,
  assertCanReadWorkControls,
} from "../policies/work-ready-done-controls-authorization.policy.js"
import type { WorkReadyDoneControlsService } from "../services/work-ready-done-controls.service.js"
import {
  workControlsEvaluationItemParamsSchema,
  workControlsEvaluationQuerySchema,
  workControlsIssueOverrideBodySchema,
  workControlsProjectMountParamsSchema,
  workControlsProjectPatchBodySchema,
  workControlsTemplatePatchBodySchema,
  workControlsWorkspaceParamsSchema,
} from "../validation/work-ready-done-controls-http.schemas.js"

function getActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) throw new Error("workspace_users_actor_missing")
  return a
}

function profileToJson(p: WorkControlsProjectProfileState) {
  return {
    workspacePublicId: p.workspacePublicId,
    projectPublicId: p.projectPublicId,
    approach: p.approach,
    version: p.version,
    definitionSource: p.definitionSource,
    criteria: p.criteria,
    kanbanColumnMapping: p.kanbanColumnMapping,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    persisted: true,
  }
}

function respondError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof WorkControlsForbiddenError) {
    res.status(403).json({ error: err.code, code: err.workControlsCode, message: err.message })
    return
  }
  if (err instanceof WorkControlsNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkControlsValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkControlsBlockedError) {
    res.status(409).json({ error: err.code, message: err.message, work_controls: err.payload })
    return
  }
  if (err instanceof Error && err.message === "workspace_users_actor_missing") {
    res.status(500).json({ error: "internal_error", message: err.message })
    return
  }
  next(err)
}

export function createWorkReadyDoneControlsProjectRouter(
  service: WorkReadyDoneControlsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const r = Router({ mergeParams: true })
  r.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  r.use(billingPrimaryProductMutationGate)

  r.get("/projects/:projectPublicId/work-controls", async (req, res, next) => {
    try {
      const parsed = workControlsProjectMountParamsSchema.safeParse(req.params)
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_path_params", details: parsed.error.flatten() })
        return
      }
      assertCanReadWorkControls(getActor(res))
      const { workspacePublicId, projectPublicId } = parsed.data
      const { profile, persisted } = await service.getProjectProfile(workspacePublicId, projectPublicId)
      res.status(200).json({ profile: { ...profileToJson(profile), persisted } })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  r.patch("/projects/:projectPublicId/work-controls", async (req, res, next) => {
    try {
      const parsedParams = workControlsProjectMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_path_params", details: parsedParams.error.flatten() })
        return
      }
      const body = workControlsProjectPatchBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      assertCanManageWorkControls(getActor(res))
      const actor = getActor(res)
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const criteria: WorkControlCriterionConfig[] = body.data.criteria.map((c) => ({
        ruleId: c.ruleId as WorkControlCriterionConfig["ruleId"],
        isEnabled: c.isEnabled,
        level: c.level,
      }))
      const out = await service.patchProjectProfile(
        workspacePublicId,
        projectPublicId,
        {
          criteria,
          kanbanColumnMapping: body.data.kanbanColumnMapping,
        },
        actor.userPublicId,
      )
      res.status(200).json({ profile: { ...profileToJson(out), persisted: true } })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  r.post("/projects/:projectPublicId/work-controls/apply-workspace-template", async (req, res, next) => {
    try {
      const parsedParams = workControlsProjectMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_path_params", details: parsedParams.error.flatten() })
        return
      }
      assertCanManageWorkControls(getActor(res))
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const out = await service.applyWorkspaceTemplateToProject(
        workspacePublicId,
        projectPublicId,
        getActor(res).userPublicId,
      )
      res.status(200).json({ profile: { ...profileToJson(out), persisted: true } })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  r.get("/projects/:projectPublicId/work-controls/evaluation/:workItemPublicId", async (req, res, next) => {
    try {
      const pe = workControlsEvaluationItemParamsSchema.safeParse(req.params)
      if (!pe.success) {
        res.status(400).json({ error: "invalid_path_params", details: pe.error.flatten() })
        return
      }
      const q = workControlsEvaluationQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      assertCanEvaluateWorkControls(getActor(res))
      const ev = await service.evaluate(
        pe.data.workspacePublicId,
        pe.data.projectPublicId,
        pe.data.workItemPublicId,
        q.data.eventCode as WorkControlEventCode,
      )
      res.status(200).json({ evaluation: ev })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  r.post("/projects/:projectPublicId/work-controls/override", async (req, res, next) => {
    try {
      const parsedParams = workControlsProjectMountParamsSchema.safeParse(req.params)
      if (!parsedParams.success) {
        res.status(400).json({ error: "invalid_path_params", details: parsedParams.error.flatten() })
        return
      }
      const body = workControlsIssueOverrideBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getActor(res)
      assertCanIssueWorkControlsOverride(actor)
      const { workspacePublicId, projectPublicId } = parsedParams.data
      const t = await service.issueOverrideToken({
        workspacePublicId,
        projectPublicId,
        workItemPublicId: body.data.workItemPublicId,
        eventCode: body.data.eventCode as WorkControlEventCode,
        reason: body.data.reason,
        actor,
      })
      res.status(201).json(t)
    } catch (err) {
      respondError(err, res, next)
    }
  })

  return r
}

export function createWorkReadyDoneControlsTemplateRouter(
  service: WorkReadyDoneControlsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const r = Router({ mergeParams: true })
  r.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  r.use(billingPrimaryProductMutationGate)

  r.get("/work-controls-template", async (req, res, next) => {
    try {
      const p = workControlsWorkspaceParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      assertCanReadWorkControls(getActor(res))
      const { template, persisted } = await service.getWorkspaceTemplate(p.data.workspacePublicId)
      res.status(200).json({
        template: {
          workspacePublicId: template.workspacePublicId,
          version: template.version,
          criteria: template.criteria,
          createdAt: template.createdAt.toISOString(),
          updatedAt: template.updatedAt.toISOString(),
          persisted,
        },
      })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  r.patch("/work-controls-template", async (req, res, next) => {
    try {
      const p = workControlsWorkspaceParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const body = workControlsTemplatePatchBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      assertCanManageWorkControls(getActor(res))
      const t = await service.patchWorkspaceTemplate(
        p.data.workspacePublicId,
        body.data.criteria.map((c) => ({
          ruleId: c.ruleId as WorkControlCriterionConfig["ruleId"],
          isEnabled: c.isEnabled,
          level: c.level,
        })),
        getActor(res).userPublicId,
      )
      res.status(200).json({
        template: {
          workspacePublicId: t.workspacePublicId,
          version: t.version,
          criteria: t.criteria,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          persisted: true,
        },
      })
    } catch (err) {
      respondError(err, res, next)
    }
  })

  return r
}
