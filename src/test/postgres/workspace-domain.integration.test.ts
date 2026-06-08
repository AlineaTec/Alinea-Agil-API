/**
 * Integración PostgreSQL — dominio workspace/organización.
 * Requiere Docker (Testcontainers) o `DATABASE_URL_TEST` / `DATABASE_URL` con POSTGRES_TEST_USE_ENV=1.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, describe, it } from "node:test"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { WorkspaceOwnerMembershipPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace-owner-membership.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { defaultIntentExpiry } from "../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { WorkspaceInvitationPrismaRepository } from "../../modules/workspace-invitations/persistence/prisma/workspace-invitation.prisma-repository.js"
import { WorkspaceLicensePrismaRepository } from "../../modules/workspace-licenses/persistence/prisma/workspace-license.prisma-repository.js"
import { WorkspaceMemberPrismaRepository } from "../../modules/workspace-users/persistence/prisma/workspace-member.prisma-repository.js"
import { WorkTeamMembershipPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-membership.prisma-repository.js"
import { WorkTeamProjectLinkPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-project-link.prisma-repository.js"
import { emptyMaterializationMeta } from "../../modules/workspace-projects/domain/project-draft-materialization.js"
import { ProjectDraftPrismaRepository } from "../../modules/workspace-projects/persistence/prisma/project-draft.prisma-repository.js"
import { ProjectRuntimePrismaRepository } from "../../modules/workspace-project-runtime/persistence/prisma/project-runtime.prisma-repository.js"
import { WorkTeamPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team.prisma-repository.js"
import {
  POSTGRES_CONTAINER_TIMEOUT_MS,
  POSTGRES_TEST_TIMEOUT_MS,
  startPostgresTestEnvironment,
  type PostgresTestContext,
} from "./postgres-test-environment.js"

const USER_ID = "70000000-0000-4000-8000-000000000001"
const INTENT_ID = "80000000-0000-4000-8000-000000000002"
const WS_ID = "90000000-0000-4000-8000-000000000003"
const OWNER_MEMBERSHIP_ID = "a0000000-0000-4000-8000-000000000004"
const MEMBER_MEMBERSHIP_ID = "b0000000-0000-4000-8000-000000000005"
const EMAIL = "workspace-pg@test.dev"

describe("Dominio workspace — PostgreSQL", { timeout: POSTGRES_TEST_TIMEOUT_MS }, () => {
  let ctx: PostgresTestContext
  let workspaces: WorkspacePrismaRepository
  let ownerMemberships: WorkspaceOwnerMembershipPrismaRepository
  let members: WorkspaceMemberPrismaRepository
  let invitations: WorkspaceInvitationPrismaRepository
  let licenses: WorkspaceLicensePrismaRepository
  let teams: WorkTeamPrismaRepository
  let teamMemberships: WorkTeamMembershipPrismaRepository
  let projectLinks: WorkTeamProjectLinkPrismaRepository

  before(async () => {
    ctx = await startPostgresTestEnvironment()
    workspaces = new WorkspacePrismaRepository(ctx.prisma)
    ownerMemberships = new WorkspaceOwnerMembershipPrismaRepository(ctx.prisma)
    members = new WorkspaceMemberPrismaRepository(ctx.prisma)
    invitations = new WorkspaceInvitationPrismaRepository(ctx.prisma)
    licenses = new WorkspaceLicensePrismaRepository(ctx.prisma)
    teams = new WorkTeamPrismaRepository(ctx.prisma)
    teamMemberships = new WorkTeamMembershipPrismaRepository(ctx.prisma)
    projectLinks = new WorkTeamProjectLinkPrismaRepository(ctx.prisma)

    const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
    const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)

    await intents.create({
      intentPublicId: INTENT_ID,
      emailNormalized: EMAIL,
      status: "ACTIVE",
      expiresAt: defaultIntentExpiry(),
    })
    await users.createRegisteredUser({
      publicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Owner User",
      passwordHash: "hash",
      modalityAtSignup: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
  }, { timeout: POSTGRES_CONTAINER_TIMEOUT_MS })

  after(async () => {
    await ctx.stop()
  })

  it("crea workspace con slug y public_id únicos", async () => {
    const slug = `ws-${Date.now()}`
    const ws = await workspaces.create({
      workspacePublicId: WS_ID,
      slug,
      displayName: "Workspace Test",
      modality: "individual",
      sourceRegistrationIntentPublicId: INTENT_ID,
    })
    assert.equal(ws.workspacePublicId, WS_ID)
    assert.equal(ws.slug, slug)

    await assert.rejects(
      () =>
        workspaces.create({
          workspacePublicId: randomUUID(),
          slug,
          displayName: "Dup slug",
          modality: "individual",
          sourceRegistrationIntentPublicId: INTENT_ID,
        }),
      (err: unknown) =>
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002",
    )
  })

  it("owner membership y member operativo coexisten sin fusionarse", async () => {
    const owner = await ownerMemberships.create({
      membershipPublicId: OWNER_MEMBERSHIP_ID,
      workspacePublicId: WS_ID,
      userPublicId: USER_ID,
      role: "owner",
    })
    assert.equal(owner.role, "owner")

    const now = new Date()
    await members.insert({
      membershipPublicId: MEMBER_MEMBERSHIP_ID,
      workspacePublicId: WS_ID,
      userPublicId: USER_ID,
      emailNormalized: EMAIL,
      fullName: "Owner User",
      status: "active",
      hasSeatAssigned: true,
      workspaceRoleAdministrative: "admin",
      workspaceRoleMethodological: null,
      createdAt: now,
      updatedAt: now,
    })

    const ownerRow = await ownerMemberships.findByWorkspaceAndUser(WS_ID, USER_ID)
    const memberRow = await members.findByWorkspaceAndUserPublicId(WS_ID, USER_ID)
    assert.ok(ownerRow)
    assert.ok(memberRow)
    assert.notEqual(ownerRow?.membershipPublicId, memberRow?.membershipPublicId)
  })

  it("invitación, licencia y equipo con membership y project link", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000)
    const now = new Date()

    await invitations.insert({
      invitationPublicId: randomUUID(),
      workspacePublicId: WS_ID,
      emailNormalized: "invite@test.dev",
      fullNameProposed: "Invitado",
      workspaceRoleAdministrative: null,
      workspaceRoleMethodological: null,
      assignSeatProposal: false,
      tokenHash: `inv-${randomUUID()}`,
      status: "pending",
      expiresAt,
      invitedByUserPublicId: USER_ID,
      acceptedAt: null,
      revokedAt: null,
      supersededByInvitationPublicId: null,
      emailCommsSentAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const pending = await invitations.findPendingByWorkspaceAndEmail(WS_ID, "invite@test.dev")
    assert.ok(pending)
    assert.equal(pending?.status, "pending")

    await licenses.insertInitial({
      workspacePublicId: WS_ID,
      seatsPurchased: 5,
      seatsAssigned: 1,
      pendingSeatReduction: null,
      nextRenewalDate: new Date(Date.UTC(2026, 6, 1)),
      lastRenewalAt: null,
    })
    const license = await licenses.findByWorkspacePublicId(WS_ID)
    assert.ok(license)
    assert.equal(license?.seatsPurchased, 5)

    const teamPublicId = randomUUID()
    await teams.insert({
      teamPublicId,
      workspacePublicId: WS_ID,
      name: "Equipo Alpha",
      nameNormalized: "equipo alpha",
      description: null,
      status: "active",
      teamLeadUserPublicId: USER_ID,
      targetSize: 5,
      createdAt: now,
      updatedAt: now,
    })

    await teamMemberships.insert({
      teamMembershipPublicId: randomUUID(),
      workspacePublicId: WS_ID,
      teamPublicId,
      userPublicId: USER_ID,
      joinedAt: now,
      leftAt: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })

    const draftPublicId = randomUUID()
    const projectPublicId = randomUUID()
    const drafts = new ProjectDraftPrismaRepository(ctx.prisma)
    await drafts.insert({
      draftPublicId,
      workspacePublicId: WS_ID,
      createdByUserPublicId: USER_ID,
      status: "materialized",
      projectName: "Proyecto enlace equipo",
      charter: { name: "Proyecto enlace equipo" },
      methodologyAssessment: {
        teamMethodologicalMaturity: 3,
        controlTraceabilityComplianceNeed: 2,
        workNature: "product_delivery",
        uncertaintyLevel: 3,
        scopeStability: 3,
        changeAcceptance: 3,
        deliveryShape: "incremental_iterative",
        interruptionFrequency: 2,
        prioritizationType: "business_value",
      },
      recommendationResult: null,
      selectedApproach: "scrum",
      wasRecommendationOverridden: null,
      overrideJustification: null,
      materializedProjectPublicId: projectPublicId,
      trace: [],
      materialization: emptyMaterializationMeta(),
      createdAt: now,
      updatedAt: now,
    })
    const projects = new ProjectRuntimePrismaRepository(ctx.prisma)
    await projects.insert({
      projectPublicId,
      workspacePublicId: WS_ID,
      sourceDraftPublicId: draftPublicId,
      projectName: "Proyecto enlace equipo",
      operationalApproach: "scrum",
      initialConfigurationSummary: {
        kind: "scrum",
        materializationContainerReady: true,
        backlog: false,
        sprints: false,
        board: false,
        baseWorkItemTypes: false,
        baseMetrics: false,
      },
      status: "active",
      materializedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await projectLinks.insert({
      teamProjectLinkPublicId: randomUUID(),
      workspacePublicId: WS_ID,
      teamPublicId,
      projectPublicId,
      createdAt: now,
      updatedAt: now,
    })

    const links = await projectLinks.listByTeam(WS_ID, teamPublicId)
    assert.equal(links.length, 1)
    assert.equal(links[0]?.projectPublicId, projectPublicId)

    const byProject = await projectLinks.listDistinctProjectPublicIdsForTeams(WS_ID, [teamPublicId])
    assert.deepEqual(byProject, [projectPublicId])
  })
})
