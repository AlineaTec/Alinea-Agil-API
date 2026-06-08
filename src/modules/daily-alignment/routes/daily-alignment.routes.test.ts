import assert from "node:assert/strict"
import { describe, it } from "node:test"
import express from "express"
import type { AddressInfo } from "node:net"
import { randomUUID } from "node:crypto"
import type { AuthBearerService } from "../../login-session/services/auth-bearer.service.js"
import { parseBearerToken } from "../../login-session/http/parse-bearer-token.js"
import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"
import type { ProjectRuntimeService } from "../../workspace-project-runtime/services/project-runtime.service.js"
import type { ScrumSprintPlanningRepository } from "../../project-scrum-sprint-planning/persistence/scrum-sprint-planning.repository.js"
import type { WorkspaceMemberRepository } from "../../workspace-users/persistence/workspace-member.repository.js"
import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import type { WorkspaceUserService } from "../../workspace-users/services/workspace-user.service.js"
import type { WorkTeamMembershipRepository } from "../../workspace-work-teams/persistence/work-team-membership.repository.js"
import type { WorkTeamProjectLinkRepository } from "../../workspace-work-teams/persistence/work-team-project-link.repository.js"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { DailyAlignmentService } from "../services/daily-alignment.service.js"
import { createDailyAlignmentRouter } from "./daily-alignment.routes.js"
import { DAILY_ALIGNMENT_DEFAULT_SLOT, type DailyAlignmentSessionState } from "../domain/daily-alignment-session.js"
import {
  EmptySprint,
  EmptyTeamLink,
  EmptyTeamMembership,
  FakeProjectRuntime,
  MemAudit,
  MemParticipant,
  MemSession,
  MemTime,
  MemWorkspaceMembers,
  P,
  W,
} from "../daily-alignment.in-memory.fixtures.js"

const U_DEV = "33333333-3333-4333-8333-333333333333"
const U_SM = "44444444-4444-4444-8444-444444444444"
const U_PO = "55555555-5555-4555-8555-555555555555"

const OTHER_WS = "77777777-7777-4777-8777-777777777777"
const WRONG_PROJECT = "88888888-8888-4888-8888-888888888888"

const SESSION_DATE = "2026-05-10"
const qToday = `?sessionDate=${SESSION_DATE}&sessionSlot=${DAILY_ALIGNMENT_DEFAULT_SLOT}`

function authHeader(userPublicId: string): Record<string, string> {
  return { Authorization: `Bearer da-${userPublicId}` }
}

function createStubAuthBearer(): Pick<AuthBearerService, "resolveFromAuthorizationHeader"> {
  return {
    async resolveFromAuthorizationHeader(authorization: string | undefined) {
      const raw = parseBearerToken(authorization)
      if (!raw || !raw.startsWith("da-")) {
        return { ok: false as const, reason: "missing_authorization" }
      }
      const userPublicId = raw.slice("da-".length)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userPublicId)) {
        return { ok: false as const, reason: "invalid_bearer" }
      }
      const now = new Date()
      return {
        ok: true as const,
        session: {
          sessionPublicId: "sess-test",
          userPublicId,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 86_400_000),
        },
        user: {
          userPublicId,
          emailNormalized: "t@test.dev",
          fullName: "T",
          modalityAtSignup: "team",
        },
      }
    },
  }
}

function createStubWorkspaceUserService(
  membersByWsUser: Map<string, WorkspaceMemberState>,
): Pick<WorkspaceUserService, "findActorMember"> {
  return {
    async findActorMember(workspacePublicId: string, userPublicId: string) {
      return membersByWsUser.get(`${workspacePublicId}\t${userPublicId}`) ?? null
    },
  }
}

function memberIndex(members: WorkspaceMemberState[]): Map<string, WorkspaceMemberState> {
  const index = new Map<string, WorkspaceMemberState>()
  for (const m of members) {
    index.set(`${m.workspacePublicId}\t${m.userPublicId}`, m)
  }
  return index
}

function buildDailyAlignmentTestApp(input: {
  approach: OperationalApproach
  members: WorkspaceMemberState[]
}): { app: express.Express } & ReturnType<typeof buildServicePair> {
  const pair = buildServicePair(input)
  const app = express()
  app.use(express.json())
  app.use(
    "/v1/workspaces/:workspacePublicId/projects/:projectPublicId/daily-alignment",
    createDailyAlignmentRouter(
      pair.svc,
      createStubAuthBearer() as unknown as AuthBearerService,
      createStubWorkspaceUserService(memberIndex(input.members)) as unknown as WorkspaceUserService,
      (_req, _res, next) => next(),
    ),
  )
  return { app, ...pair }
}

function buildServicePair(input: { approach: OperationalApproach; members: WorkspaceMemberState[] }) {
  const sessions = new MemSession()
  const participants = new MemParticipant()
  const svc = new DailyAlignmentService(
    new FakeProjectRuntime(input.approach) as unknown as ProjectRuntimeService,
    new EmptySprint() as unknown as ScrumSprintPlanningRepository,
    sessions,
    participants,
    new MemTime(0),
    new MemAudit(),
    new EmptyTeamLink() as unknown as WorkTeamProjectLinkRepository,
    new EmptyTeamMembership() as unknown as WorkTeamMembershipRepository,
    new MemWorkspaceMembers(input.members) as unknown as WorkspaceMemberRepository,
  )
  return { svc, sessions, participants }
}

async function withListeningServer(app: express.Express, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = await new Promise<import("node:http").Server>((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s))
    s.once("error", reject)
  })
  try {
    const addr = server.address() as AddressInfo
    await fn(`http://127.0.0.1:${addr.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
  }
}

function scrumTeam(): WorkspaceMemberState[] {
  return [
    minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: U_DEV,
      workspaceRoleMethodological: "scrum_developer",
    }),
    minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: U_SM,
      workspaceRoleMethodological: "scrum_master",
    }),
    minimalWorkspaceMember({
      workspacePublicId: W,
      userPublicId: U_PO,
      workspaceRoleMethodological: "product_owner",
    }),
  ]
}

const bodyValid = {
  yesterdaySummary: "y",
  todayPlan: "t",
  impediments: "",
  confirmedFromSuggestion: false,
}

describe("daily-alignment.routes (HTTP)", () => {
  it("GET /today returns 401 without bearer", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`)
      assert.equal(res.status, 401)
    })
  })

  it("GET /today returns 403 when user is not a workspace member", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${OTHER_WS}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 403)
      const j = (await res.json()) as { code?: string }
      assert.equal(j.code, "not_workspace_member")
    })
  })

  it("GET /today returns 200 with session null before first write", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 200)
      const j = (await res.json()) as { session: unknown; supportLevel: string; operationalApproach: string }
      assert.equal(j.session, null)
      assert.equal(j.supportLevel, "full")
      assert.equal(j.operationalApproach, "scrum")
    })
  })

  it("GET /today Kanban returns supportLevel flow_check_in", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "kanban", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 200)
      const j = (await res.json()) as { supportLevel: string }
      assert.equal(j.supportLevel, "flow_check_in")
    })
  })

  it("GET /today predictive returns supportLevel unsupported without error", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "predictive_phases", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 200)
      const j = (await res.json()) as { supportLevel: string; session: unknown }
      assert.equal(j.supportLevel, "unsupported")
      assert.equal(j.session, null)
    })
  })

  it("returns 400 invalid_path_params when projectPublicId is not a uuid", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/not-a-uuid/daily-alignment/today${qToday}`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 400)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "invalid_path_params")
    })
  })

  it("GET /today returns 404 for unknown operational project", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${WRONG_PROJECT}/daily-alignment/today${qToday}`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 404)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_not_found")
    })
  })

  it("GET /today returns 400 for invalid sessionDate query format", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today?sessionDate=2026-5-10`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 400)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "invalid_query")
    })
  })

  it("GET /today returns 400 for invalid session slot (service validation)", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today?sessionDate=${SESSION_DATE}&sessionSlot=bad%20slot`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 400)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_validation")
    })
  })

  it("GET /today returns 403 for deactivated reader (project runtime policy)", async () => {
    const members = [
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_DEV,
        status: "deactivated",
        workspaceRoleMethodological: "scrum_developer",
      }),
    ]
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members })
    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 403)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "project_runtime_forbidden")
    })
  })

  it("GET /today/my-update returns null update when session not created", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as { update: unknown; session: unknown }
      assert.equal(j.session, null)
      assert.equal(j.update, null)
    })
  })

  it("POST /today/my-update lazy-creates session then GET /today returns it", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const post = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify(bodyValid),
        },
      )
      assert.equal(post.status, 200)
      const get = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today${qToday}`, {
        headers: { ...authHeader(U_SM) },
      })
      assert.equal(get.status, 200)
      const j = (await get.json()) as { session: { status: string; sessionPublicId: string } | null }
      assert.ok(j.session)
      assert.equal(j.session!.status, "open")
    })
  })

  it("POST /today/my-update returns 400 on invalid body", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify({ confirmedFromSuggestion: "not-a-boolean" }),
        },
      )
      assert.equal(res.status, 400)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "invalid_body")
    })
  })

  it("POST /today/my-update returns 409 when predictive_phases", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "predictive_phases", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify(bodyValid),
        },
      )
      assert.equal(res.status, 409)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_unsupported")
    })
  })

  it("POST /today/my-update returns 409 after session closed", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const post1 = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify(bodyValid),
        },
      )
      assert.equal(post1.status, 200)
      const close = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "fin",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(close.status, 200)
      const post2 = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify({ ...bodyValid, yesterdaySummary: "changed" }),
        },
      )
      assert.equal(post2.status, 409)
    })
    assert.ok(sessions.sessions.size >= 1)
  })

  it("GET /today/session lists expected participants and missing before close", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`, {
        method: "POST",
        headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
        body: JSON.stringify(bodyValid),
      })
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/session${qToday}`,
        { headers: { ...authHeader(U_SM) } },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as {
        expectedParticipantUserPublicIds: string[]
        missingParticipantUserPublicIds: string[]
        participants: { userPublicId: string }[]
      }
      assert.deepEqual(j.expectedParticipantUserPublicIds.sort(), [U_DEV, U_PO, U_SM].sort())
      assert.deepEqual(j.missingParticipantUserPublicIds.sort(), [U_PO, U_SM].sort())
      assert.equal(j.participants.length, 1)
      assert.equal(j.participants[0]!.userPublicId, U_DEV)
    })
  })

  it("POST /today/close as Scrum Master yields closed_incomplete when PO missing", async () => {
    const members = [
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_DEV,
        workspaceRoleMethodological: "scrum_developer",
      }),
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_SM,
        workspaceRoleMethodological: "scrum_master",
      }),
    ]
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members })
    await withListeningServer(app, async (base) => {
      await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/my-update${qToday}`, {
        method: "POST",
        headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
        body: JSON.stringify(bodyValid),
      })
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "done",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as { session: { status: string } }
      assert.equal(j.session.status, "closed_incomplete")
    })
  })

  it("POST /today/close returns 403 for product_owner", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_PO), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "x",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(res.status, 403)
      const j = (await res.json()) as { error?: string; message?: string }
      assert.equal(j.error, "daily_alignment_forbidden")
      assert.ok(j.message?.includes("Scrum Master"))
    })
  })

  it("POST /today/close returns 403 for scrum_developer", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "x",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(res.status, 403)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_forbidden")
    })
  })

  it("POST /today/close returns 400 on invalid body", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({ agreements: "not-array" }),
        },
      )
      assert.equal(res.status, 400)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "invalid_body")
    })
  })

  it("POST /today/close returns 409 for predictive", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "predictive_phases", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "x",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(res.status, 409)
      const j = (await res.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_unsupported")
    })
  })

  it("POST /today/close Kanban succeeds for Scrum Master", async () => {
    const members = [
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_DEV,
        workspaceRoleMethodological: "scrum_developer",
      }),
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_SM,
        workspaceRoleMethodological: "scrum_master",
      }),
    ]
    const { app } = buildDailyAlignmentTestApp({ approach: "kanban", members })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({
            generalSummary: "kanban close",
            agreements: [],
            escalatedImpediments: [],
            followUps: [],
          }),
        },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as { session: { status: string } }
      assert.ok(["closed", "closed_incomplete"].includes(j.session.status))
    })
  })

  it("POST /today/close returns 409 when session already closed", async () => {
    const members = [
      minimalWorkspaceMember({
        workspacePublicId: W,
        userPublicId: U_SM,
        workspaceRoleMethodological: "scrum_master",
      }),
    ]
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members })
    const closeBody = JSON.stringify({
      generalSummary: "once",
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
    })
    await withListeningServer(app, async (base) => {
      const first = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: closeBody,
        },
      )
      assert.equal(first.status, 200)
      const second = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/today/close${qToday}`,
        {
          method: "POST",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: closeBody,
        },
      )
      assert.equal(second.status, 409)
      const j = (await second.json()) as { error?: string }
      assert.equal(j.error, "daily_alignment_conflict")
    })
  })

  it("GET /recent returns 403 for user not in workspace", async () => {
    const { app } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${OTHER_WS}/projects/${P}/daily-alignment/recent?limit=5`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 403)
    })
  })

  it("GET /recent returns sessions ordered by sessionDate desc", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    const now = new Date()
    const older: DailyAlignmentSessionState = {
      sessionPublicId: randomUUID(),
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-08",
      sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      alignmentMode: "live",
      facilitatorUserPublicId: null,
      status: "closed",
      startedAt: now,
      closedAt: now,
      closeoutSummary: "old",
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
    const newer = { ...older, sessionPublicId: randomUUID(), sessionDate: "2026-05-09", closeoutSummary: "new" }
    sessions.sessions.set(sessions.key(older), older)
    sessions.sessions.set(sessions.key(newer), newer)

    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/recent?limit=10`,
        { headers: { ...authHeader(U_DEV) } },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as { sessions: { sessionDate: string }[] }
      assert.equal(j.sessions.length, 2)
      assert.equal(j.sessions[0]!.sessionDate, "2026-05-09")
      assert.equal(j.sessions[1]!.sessionDate, "2026-05-08")
    })
  })

  it("GET /sessions/:sessionPublicId returns session and participants", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    const now = new Date()
    const sid = randomUUID()
    const closed: DailyAlignmentSessionState = {
      sessionPublicId: sid,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-07",
      sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      alignmentMode: "live",
      facilitatorUserPublicId: U_SM,
      status: "closed",
      startedAt: now,
      closedAt: now,
      closeoutSummary: "x",
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
    sessions.sessions.set(sessions.key(closed), closed)

    await withListeningServer(app, async (base) => {
      const res = await fetch(`${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/sessions/${sid}`, {
        headers: { ...authHeader(U_DEV) },
      })
      assert.equal(res.status, 200)
      const j = (await res.json()) as { session: { sessionPublicId: string } | null }
      assert.equal(j.session?.sessionPublicId, sid)
    })
  })

  it("PATCH /sessions/:sessionPublicId/facilitator-transcript returns 403 for developer", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    const now = new Date()
    const sid = randomUUID()
    const closed: DailyAlignmentSessionState = {
      sessionPublicId: sid,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-07",
      sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      alignmentMode: "live",
      facilitatorUserPublicId: U_SM,
      status: "closed",
      startedAt: now,
      closedAt: now,
      closeoutSummary: "x",
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
    sessions.sessions.set(sessions.key(closed), closed)

    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/sessions/${sid}/facilitator-transcript`,
        {
          method: "PATCH",
          headers: { ...authHeader(U_DEV), "Content-Type": "application/json" },
          body: JSON.stringify({ facilitatorTranscript: "nota" }),
        },
      )
      assert.equal(res.status, 403)
    })
  })

  it("PATCH /sessions/:sessionPublicId/facilitator-transcript updates transcript for scrum master", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    const now = new Date()
    const sid = randomUUID()
    const closed: DailyAlignmentSessionState = {
      sessionPublicId: sid,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-07",
      sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      alignmentMode: "live",
      facilitatorUserPublicId: U_SM,
      status: "closed",
      startedAt: now,
      closedAt: now,
      closeoutSummary: "x",
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
    sessions.sessions.set(sessions.key(closed), closed)

    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/sessions/${sid}/facilitator-transcript`,
        {
          method: "PATCH",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({ facilitatorTranscript: "  línea 1  " }),
        },
      )
      assert.equal(res.status, 200)
      const j = (await res.json()) as { session: { facilitatorTranscript: string | null } }
      assert.equal(j.session.facilitatorTranscript, "línea 1")
    })
  })

  it("PATCH /sessions/:sessionPublicId/facilitator-transcript returns 409 when session open", async () => {
    const { app, sessions } = buildDailyAlignmentTestApp({ approach: "scrum", members: scrumTeam() })
    const now = new Date()
    const sid = randomUUID()
    const open: DailyAlignmentSessionState = {
      sessionPublicId: sid,
      workspacePublicId: W,
      projectPublicId: P,
      sessionDate: "2026-05-07",
      sessionSlot: DAILY_ALIGNMENT_DEFAULT_SLOT,
      sprintPublicId: null,
      operationalApproach: "scrum",
      operationalTimeZone: "UTC",
      alignmentMode: "live",
      facilitatorUserPublicId: null,
      status: "open",
      startedAt: now,
      closedAt: null,
      closeoutSummary: null,
      facilitatorTranscript: null,
      agreements: [],
      escalatedImpediments: [],
      followUps: [],
      createdAt: now,
      updatedAt: now,
    }
    sessions.sessions.set(sessions.key(open), open)

    await withListeningServer(app, async (base) => {
      const res = await fetch(
        `${base}/v1/workspaces/${W}/projects/${P}/daily-alignment/sessions/${sid}/facilitator-transcript`,
        {
          method: "PATCH",
          headers: { ...authHeader(U_SM), "Content-Type": "application/json" },
          body: JSON.stringify({ facilitatorTranscript: "x" }),
        },
      )
      assert.equal(res.status, 409)
    })
  })
})
