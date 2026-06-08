import { Router, type NextFunction, type RequestHandler, type Response } from "express"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { workspaceUsersAuthMiddlewares } from "../../workspace-users/middleware/workspace-users-auth.middleware.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import { ProjectRuntimeNotFoundError } from "../../workspace-project-runtime/domain/project-runtime.errors.js"
import type { WorkTeamProjectLinkState, WorkTeamState } from "../domain/work-team.js"
import {
  WorkTeamConflictError,
  WorkTeamForbiddenError,
  WorkTeamNotFoundError,
  WorkTeamValidationError,
} from "../domain/work-team.errors.js"
import type { WorkTeamsService } from "../services/work-teams.service.js"
import {
  addWorkTeamMemberBodySchema,
  createWorkTeamBodySchema,
  linkWorkTeamProjectBodySchema,
  listWorkTeamAuditQuerySchema,
  listWorkTeamMembersQuerySchema,
  listWorkTeamsQuerySchema,
  patchWorkTeamBodySchema,
  removeWorkTeamMemberBodyWhenLeadSchema,
  workTeamPathParamsSchema,
  workTeamsMountParamsSchema,
} from "../validation/work-team-http.schemas.js"
import { z } from "zod"

function getRequiredActor(res: Response): WorkspaceMemberState {
  const a = res.locals.workspaceUsersActor
  if (!a) {
    throw new Error("workspace_users_actor_missing")
  }
  return a
}

function workTeamJson(t: WorkTeamState) {
  return {
    teamPublicId: t.teamPublicId,
    workspacePublicId: t.workspacePublicId,
    name: t.name,
    description: t.description,
    status: t.status,
    teamLeadUserPublicId: t.teamLeadUserPublicId,
    targetSize: t.targetSize,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

function membershipJson(m: {
  teamMembershipPublicId: string
  workspacePublicId: string
  teamPublicId: string
  userPublicId: string
  joinedAt: Date
  leftAt: Date | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    teamMembershipPublicId: m.teamMembershipPublicId,
    teamPublicId: m.teamPublicId,
    userPublicId: m.userPublicId,
    isActive: m.isActive,
    joinedAt: m.joinedAt.toISOString(),
    leftAt: m.leftAt ? m.leftAt.toISOString() : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }
}

function projectLinkJson(l: WorkTeamProjectLinkState) {
  return {
    teamProjectLinkPublicId: l.teamProjectLinkPublicId,
    projectPublicId: l.projectPublicId,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }
}

export function respondWorkTeamError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof WorkTeamForbiddenError) {
    res.status(403).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkTeamValidationError) {
    res.status(400).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkTeamConflictError) {
    res.status(409).json({ error: err.code, message: err.message })
    return
  }
  if (err instanceof WorkTeamNotFoundError) {
    res.status(404).json({ error: err.code, message: err.message })
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

const teamAndUserParamsSchema = workTeamPathParamsSchema.extend({
  userPublicId: z.string().uuid(),
})

const teamAndProjectParamsSchema = workTeamPathParamsSchema.extend({
  projectPublicId: z.string().min(1),
})

export function createWorkTeamsRouter(
  workTeamsService: WorkTeamsService,
  authBearerService: AuthBearerService,
  workspaceUserService: WorkspaceUserService,
  billingPrimaryProductMutationGate: RequestHandler,
): Router {
  const router = Router({ mergeParams: true })
  router.use(workspaceUsersAuthMiddlewares(authBearerService, workspaceUserService))
  router.use(billingPrimaryProductMutationGate)

  router.get("/", async (req, res, next) => {
    try {
      const p = workTeamsMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = listWorkTeamsQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      const limit = q.data.limit ?? 50
      const offset = q.data.offset ?? 0
      const actor = getRequiredActor(res)
      const result = await workTeamsService.listTeams(
        actor,
        p.data.workspacePublicId,
        {
          status: q.data.status,
          teamLeadUserPublicId: q.data.teamLeadUserPublicId,
          memberUserPublicId: q.data.memberUserPublicId,
          q: q.data.q,
        },
        { limit, offset },
      )
      res.status(200).json({
        items: result.items.map(workTeamJson),
        totalCount: result.totalCount,
        limit,
        offset,
      })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.post("/", async (req, res, next) => {
    try {
      const p = workTeamsMountParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const body = createWorkTeamBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const created = await workTeamsService.createTeam(actor, p.data.workspacePublicId, body.data)
      res.status(201).json(workTeamJson(created))
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.get("/:teamPublicId", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const { team, linkedProjects } = await workTeamsService.getTeamDetail(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
      )
      res.status(200).json({
        ...workTeamJson(team),
        linkedProjects,
      })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.patch("/:teamPublicId", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const body = patchWorkTeamBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const updated = await workTeamsService.patchTeam(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        body.data,
      )
      res.status(200).json(workTeamJson(updated))
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.get("/:teamPublicId/members", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = listWorkTeamMembersQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const rows = await workTeamsService.listMembers(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        q.data.includeInactive,
      )
      res.status(200).json({ items: rows.map(membershipJson) })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.post("/:teamPublicId/members", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const body = addWorkTeamMemberBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const row = await workTeamsService.addMember(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        body.data.userPublicId,
      )
      res.status(201).json(membershipJson(row))
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.delete("/:teamPublicId/members/:userPublicId", async (req, res, next) => {
    try {
      const p = teamAndUserParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      let leadBody: ReturnType<typeof removeWorkTeamMemberBodyWhenLeadSchema.safeParse>["data"] | null = null
      if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
        const parsed = removeWorkTeamMemberBodyWhenLeadSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() })
          return
        }
        leadBody = parsed.data
      }
      const actor = getRequiredActor(res)
      await workTeamsService.removeMember(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        p.data.userPublicId,
        leadBody,
      )
      res.status(204).send()
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.get("/:teamPublicId/projects", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      const links = await workTeamsService.listTeamProjects(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
      )
      res.status(200).json({ items: links.map(projectLinkJson) })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.post("/:teamPublicId/projects", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const body = linkWorkTeamProjectBodySchema.safeParse(req.body)
      if (!body.success) {
        res.status(400).json({ error: "invalid_body", details: body.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      await workTeamsService.linkProject(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        body.data.projectPublicId,
      )
      res.status(204).send()
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.delete("/:teamPublicId/projects/:projectPublicId", async (req, res, next) => {
    try {
      const p = teamAndProjectParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const actor = getRequiredActor(res)
      await workTeamsService.unlinkProject(
        actor,
        p.data.workspacePublicId,
        p.data.teamPublicId,
        p.data.projectPublicId,
      )
      res.status(204).send()
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  router.get("/:teamPublicId/audit", async (req, res, next) => {
    try {
      const p = workTeamPathParamsSchema.safeParse(req.params)
      if (!p.success) {
        res.status(400).json({ error: "invalid_path_params", details: p.error.flatten() })
        return
      }
      const q = listWorkTeamAuditQuerySchema.safeParse(req.query)
      if (!q.success) {
        res.status(400).json({ error: "invalid_query", details: q.error.flatten() })
        return
      }
      const limit = q.data.limit ?? 50
      const offset = q.data.offset ?? 0
      const actor = getRequiredActor(res)
      const result = await workTeamsService.listAudit(actor, p.data.workspacePublicId, p.data.teamPublicId, {
        limit,
        offset,
      })
      res.status(200).json({
        items: result.items.map((e) => ({
          auditEventPublicId: e.auditEventPublicId,
          teamPublicId: e.teamPublicId,
          action: e.action,
          actorUserPublicId: e.actorUserPublicId,
          occurredAt: e.occurredAt.toISOString(),
          payloadBefore: e.payloadBefore,
          payloadAfter: e.payloadAfter,
        })),
        totalCount: result.totalCount,
        limit,
        offset,
      })
    } catch (err) {
      respondWorkTeamError(err, res, next)
    }
  })

  return router
}
