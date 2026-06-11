import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { projectDraftToHttpBody } from "../dto/project-draft-http.dto.js"
import {
  ProjectDraftForbiddenError,
  ProjectDraftInvalidOperationError,
  ProjectDraftInvalidTransitionError,
  ProjectDraftNotFoundError,
} from "../domain/project-draft.errors.js"
import { assertCanAccessProjectDraftWizardPreliminary } from "../policies/project-draft-authorization.policy.js"
import { WorkspaceActiveProjectLimitError } from "../../commercial-pricing/workspace-plan-limits.policy.js"
import type { ProjectDraftService } from "../services/project-draft.service.js"
import {
  createProjectDraftBodySchema,
  patchAssessmentBodySchema,
  patchCharterBodySchema,
  postDecisionBodySchema,
  postEmptyStrictBodySchema,
  projectDraftPathParamsSchema,
  workspaceProjectsPathParamsSchema,
} from "../validation/workspace-projects-http.schemas.js"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function respondDraftError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ProjectDraftForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectDraftInvalidOperationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof ProjectDraftInvalidTransitionError) {
    res.status(400).json({
      error: err.code,
      message: err.message,
      details: err.details,
    })
    return
  }
  if (err instanceof ProjectDraftNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkspaceActiveProjectLimitError) {
    res.status(403).json({
      error: err.code,
      message: err.message,
      planTier: err.planTier,
      maxActiveProjects: err.maxActiveProjects,
      currentActiveProjects: err.currentActiveProjects,
    })
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
 * Rutas bajo `/v1/workspaces/:workspacePublicId/projects/drafts`.
 * Bearer + miembro del workspace; autorización preliminar (mismo perfil para GET y POST).
 */
export function createWorkspaceProjectsRouter(
  projectDraftService: ProjectDraftService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceProjectsPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }

      const actor = getRequiredActor(res)
      assertCanAccessProjectDraftWizardPreliminary(actor)

      const body = createProjectDraftBodySchema.safeParse(req.body ?? {})
      if (!body.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "Cuerpo inválido.",
          details: body.error.flatten(),
        })
        return
      }

      const draft = await projectDraftService.createDraft({
        workspacePublicId: params.data.workspacePublicId,
        createdByUserPublicId: actor.userPublicId,
        projectName: body.data.projectName,
      })

      res.status(201).json({ draft: projectDraftToHttpBody(draft) })
    } catch (err) {
      respondDraftError(err, res, next)
    }
  })

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = workspaceProjectsPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId debe ser un UUID.",
          details: params.error.flatten(),
        })
        return
      }

      assertCanAccessProjectDraftWizardPreliminary(getRequiredActor(res))

      const drafts = await projectDraftService.listDraftsByWorkspace(params.data.workspacePublicId)
      res.status(200).json({
        drafts: drafts.map((d) => projectDraftToHttpBody(d)),
      })
    } catch (err) {
      respondDraftError(err, res, next)
    }
  })

  router.patch(
    "/:draftPublicId/charter",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = patchCharterBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Cuerpo de charter inválido.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.saveCharter(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          body.data,
          { actorUserPublicId: actor.userPublicId },
        )

        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.patch(
    "/:draftPublicId/assessment",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = patchAssessmentBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Cuerpo de evaluación inválido.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.saveAssessment(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          body.data,
          { actorUserPublicId: actor.userPublicId },
        )

        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.post(
    "/:draftPublicId/recommend",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = postEmptyStrictBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "El cuerpo debe ser un objeto JSON vacío sin propiedades adicionales.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.recommendDraft(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          { actorUserPublicId: actor.userPublicId },
        )
        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.post(
    "/:draftPublicId/decision",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = postDecisionBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "Cuerpo de decisión inválido.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.recordDecision(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          {
            selectedApproach: body.data.selectedApproach,
            overrideJustification: body.data.overrideJustification,
            actorUserPublicId: actor.userPublicId,
          },
        )
        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.post(
    "/:draftPublicId/not-ready-complete",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = postEmptyStrictBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "El cuerpo debe ser un objeto JSON vacío sin propiedades adicionales.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.markNotReadyComplete(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          { actorUserPublicId: actor.userPublicId },
        )
        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.post(
    "/:draftPublicId/materialize",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = projectDraftPathParamsSchema.safeParse(req.params)
        if (!params.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "workspacePublicId y draftPublicId deben ser UUID.",
            details: params.error.flatten(),
          })
          return
        }

        const actor = getRequiredActor(res)
        assertCanAccessProjectDraftWizardPreliminary(actor)

        const body = postEmptyStrictBodySchema.safeParse(req.body ?? {})
        if (!body.success) {
          res.status(400).json({
            error: "invalid_request",
            message: "El cuerpo debe ser un objeto JSON vacío sin propiedades adicionales.",
            details: body.error.flatten(),
          })
          return
        }

        const draft = await projectDraftService.materializeDraft(
          params.data.workspacePublicId,
          params.data.draftPublicId,
          { actorUserPublicId: actor.userPublicId },
        )
        res.status(200).json({ draft: projectDraftToHttpBody(draft) })
      } catch (err) {
        respondDraftError(err, res, next)
      }
    },
  )

  router.delete("/:draftPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = projectDraftPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId y draftPublicId deben ser UUID.",
          details: params.error.flatten(),
        })
        return
      }

      assertCanAccessProjectDraftWizardPreliminary(getRequiredActor(res))

      await projectDraftService.deleteDraft(params.data.workspacePublicId, params.data.draftPublicId)
      res.status(204).end()
    } catch (err) {
      respondDraftError(err, res, next)
    }
  })

  router.get("/:draftPublicId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = projectDraftPathParamsSchema.safeParse(req.params)
      if (!params.success) {
        res.status(400).json({
          error: "invalid_request",
          message: "workspacePublicId y draftPublicId deben ser UUID.",
          details: params.error.flatten(),
        })
        return
      }

      assertCanAccessProjectDraftWizardPreliminary(getRequiredActor(res))

      const draft = await projectDraftService.getDraft(
        params.data.workspacePublicId,
        params.data.draftPublicId,
      )
      res.status(200).json({ draft: projectDraftToHttpBody(draft) })
    } catch (err) {
      respondDraftError(err, res, next)
    }
  })

  return router
}
