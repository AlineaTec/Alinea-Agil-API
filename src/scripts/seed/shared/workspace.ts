import { IdentityRegistrationIntentPrismaRepository } from "../../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import { IdentityUserForAuthPrismaRepository } from "../../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import { WorkspacePrismaRepository } from "../../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import { WorkspaceOwnerMembershipPrismaRepository } from "../../../modules/registro-onboarding/persistence/prisma/workspace-owner-membership.prisma-repository.js"
import { WorkspaceMemberPrismaRepository } from "../../../modules/workspace-users/persistence/prisma/workspace-member.prisma-repository.js"
import { WorkspaceLicensePrismaRepository } from "../../../modules/workspace-licenses/persistence/prisma/workspace-license.prisma-repository.js"
import { WorkTeamPrismaRepository } from "../../../modules/workspace-work-teams/persistence/prisma/work-team.prisma-repository.js"
import { WorkTeamMembershipPrismaRepository } from "../../../modules/workspace-work-teams/persistence/prisma/work-team-membership.prisma-repository.js"
import { PlatformTenantPrismaRepository } from "../../../modules/platform-tenants/persistence/prisma/platform-tenant.prisma-repository.js"
import { defaultIntentExpiry } from "../../../modules/registro-onboarding/services/registration-intent-ttl.js"
import { daysAhead } from "./dates.js"
import type { SeedContext } from "./context.js"

export type SeedUserSpec = {
  publicId: string
  email: string
  fullName: string
  membershipPublicId: string
  hasSeat: boolean
  adminRole?: string | null
  methodRole?: string | null
}

export type WorkspaceBundleOptions = {
  intentPublicId: string
  workspacePublicId: string
  slug: string
  displayName: string
  modality: "individual" | "team" | "empresa"
  owner: SeedUserSpec
  members: SeedUserSpec[]
  seatsPurchased: number
  teams: Array<{
    teamPublicId: string
    name: string
    leadUserPublicId: string
    memberUserPublicIds: string[]
  }>
  withPlatformTenant?: boolean
  platformTenantId?: string
}

export async function seedWorkspaceBundle(
  ctx: SeedContext,
  opts: WorkspaceBundleOptions,
): Promise<void> {
  const intents = new IdentityRegistrationIntentPrismaRepository(ctx.prisma)
  const users = new IdentityUserForAuthPrismaRepository(ctx.prisma)
  const workspaces = new WorkspacePrismaRepository(ctx.prisma)
  const owners = new WorkspaceOwnerMembershipPrismaRepository(ctx.prisma)
  const members = new WorkspaceMemberPrismaRepository(ctx.prisma)
  const licenses = new WorkspaceLicensePrismaRepository(ctx.prisma)
  const teams = new WorkTeamPrismaRepository(ctx.prisma)
  const teamMemberships = new WorkTeamMembershipPrismaRepository(ctx.prisma)
  const platformTenants = new PlatformTenantPrismaRepository(ctx.prisma)

  const allUsers = [opts.owner, ...opts.members]
  const primaryEmail = opts.owner.email

  await intents.create({
    intentPublicId: opts.intentPublicId,
    emailNormalized: primaryEmail,
    status: "ACTIVE",
    expiresAt: defaultIntentExpiry(),
  })

  for (const u of allUsers) {
    const existing = await users.findByEmailNormalized(u.email)
    if (!existing) {
      await users.createRegisteredUser({
        publicId: u.publicId,
        emailNormalized: u.email,
        fullName: u.fullName,
        passwordHash: ctx.passwordHash,
        modalityAtSignup: opts.modality,
        sourceRegistrationIntentPublicId: opts.intentPublicId,
      })
    }
  }

  const wsExisting = await workspaces.findByWorkspacePublicId(opts.workspacePublicId)
  if (!wsExisting) {
    await workspaces.create({
      workspacePublicId: opts.workspacePublicId,
      slug: opts.slug,
      displayName: opts.displayName,
      modality: opts.modality,
      sourceRegistrationIntentPublicId: opts.intentPublicId,
    })
  }

  const ownerExisting = await owners.findByWorkspaceAndUser(
    opts.workspacePublicId,
    opts.owner.publicId,
  )
  if (!ownerExisting) {
    await owners.create({
      membershipPublicId: opts.owner.membershipPublicId,
      workspacePublicId: opts.workspacePublicId,
      userPublicId: opts.owner.publicId,
      role: "owner",
    })
  }

  const now = ctx.now
  for (const m of allUsers) {
    const found = await members.findByWorkspaceAndUserPublicId(opts.workspacePublicId, m.publicId)
    if (!found) {
      await members.insert({
        membershipPublicId: m.membershipPublicId,
        workspacePublicId: opts.workspacePublicId,
        userPublicId: m.publicId,
        emailNormalized: m.email,
        fullName: m.fullName,
        status: "active",
        hasSeatAssigned: m.hasSeat,
        workspaceRoleAdministrative: (m.adminRole as "admin") ?? null,
        workspaceRoleMethodological: (m.methodRole as "scrum_master") ?? null,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  const license = await licenses.findByWorkspacePublicId(opts.workspacePublicId)
  if (!license) {
    await licenses.insertInitial({
      workspacePublicId: opts.workspacePublicId,
      seatsPurchased: opts.seatsPurchased,
      seatsAssigned: allUsers.filter((u) => u.hasSeat).length,
      pendingSeatReduction: null,
      nextRenewalDate: daysAhead(now, 30),
      lastRenewalAt: now,
    })
  }

  for (const [teamIdx, t] of opts.teams.entries()) {
    const nameNormalized = t.name.trim().toLowerCase()
    const existingTeam = await teams.findByWorkspaceAndNameNormalized(
      opts.workspacePublicId,
      nameNormalized,
    )
    if (!existingTeam) {
      await teams.insert({
        teamPublicId: t.teamPublicId,
        workspacePublicId: opts.workspacePublicId,
        name: t.name,
        nameNormalized,
        description: `${t.name} — seed`,
        status: "active",
        teamLeadUserPublicId: t.leadUserPublicId,
        targetSize: t.memberUserPublicIds.length,
        createdAt: now,
        updatedAt: now,
      })
    }
    let teamMemberIdx = 0
    for (const userId of t.memberUserPublicIds) {
      teamMemberIdx += 1
      const teamPart = String(teamIdx + 1).padStart(2, "0")
      const memberPart = String(teamMemberIdx).padStart(2, "0")
      const memId = `e601${teamPart}${memberPart}-0000-4000-8000-000000000001`
      const existingMem = await teamMemberships.findActiveByTeamAndUser(t.teamPublicId, userId)
      if (!existingMem) {
        await teamMemberships.insert({
          teamMembershipPublicId: memId,
          teamPublicId: t.teamPublicId,
          workspacePublicId: opts.workspacePublicId,
          userPublicId: userId,
          joinedAt: now,
          leftAt: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  if (opts.withPlatformTenant && opts.platformTenantId) {
    const tenant = await platformTenants.findByWorkspacePublicId(opts.workspacePublicId)
    if (!tenant) {
      await platformTenants.insert({
        platformTenantId: opts.platformTenantId,
        workspacePublicId: opts.workspacePublicId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  ctx.log(`Workspace: ${opts.displayName} (${opts.slug}) — ${allUsers.length} usuarios`)
}
