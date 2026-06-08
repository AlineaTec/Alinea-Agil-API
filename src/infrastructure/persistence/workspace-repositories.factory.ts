import type { WorkspaceInvitationRepository } from "../../modules/workspace-invitations/persistence/workspace-invitation.repository.js"
import { WorkspaceInvitationPrismaRepository } from "../../modules/workspace-invitations/persistence/prisma/workspace-invitation.prisma-repository.js"
import type { WorkspaceLicenseRepository } from "../../modules/workspace-licenses/persistence/workspace-license.repository.js"
import { WorkspaceLicensePrismaRepository } from "../../modules/workspace-licenses/persistence/prisma/workspace-license.prisma-repository.js"
import type { WorkspaceRepository } from "../../modules/registro-onboarding/persistence/workspace.repository.js"
import { WorkspacePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace.prisma-repository.js"
import type { WorkspaceOwnerMembershipRepository } from "../../modules/registro-onboarding/persistence/workspace-owner-membership.repository.js"
import { WorkspaceOwnerMembershipPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/workspace-owner-membership.prisma-repository.js"
import type { WorkspaceMemberRepository } from "../../modules/workspace-users/persistence/workspace-member.repository.js"
import { WorkspaceMemberPrismaRepository } from "../../modules/workspace-users/persistence/prisma/workspace-member.prisma-repository.js"
import type { WorkspaceIdentityRepository } from "../../modules/workspace-users/persistence/workspace-identity.repository.js"
import { WorkspaceIdentityPrismaRepository } from "../../modules/workspace-users/persistence/prisma/workspace-identity.prisma-repository.js"
import type { WorkTeamRepository } from "../../modules/workspace-work-teams/persistence/work-team.repository.js"
import { WorkTeamPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team.prisma-repository.js"
import type { WorkTeamMembershipRepository } from "../../modules/workspace-work-teams/persistence/work-team-membership.repository.js"
import { WorkTeamMembershipPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-membership.prisma-repository.js"
import type { WorkTeamProjectLinkRepository } from "../../modules/workspace-work-teams/persistence/work-team-project-link.repository.js"
import { WorkTeamProjectLinkPrismaRepository } from "../../modules/workspace-work-teams/persistence/prisma/work-team-project-link.prisma-repository.js"
import type { WorkspaceSettingsRepository } from "../../modules/workspace-settings/persistence/workspace-settings-read.repository.js"
import { WorkspaceSettingsPrismaRepository } from "../../modules/workspace-settings/persistence/prisma/workspace-settings.prisma-repository.js"
import type { PrismaClient } from "@prisma/client"
import { getPrismaClient } from "../postgres/prisma-client.js"
import type { PersistenceDriver } from "./persistence-driver.js"

export type WorkspaceRepositories = {
  driver: PersistenceDriver
  member: WorkspaceMemberRepository
  identity: WorkspaceIdentityRepository
  invitation: WorkspaceInvitationRepository
  license: WorkspaceLicenseRepository
  workTeam: WorkTeamRepository
  workTeamMembership: WorkTeamMembershipRepository
  workTeamProjectLink: WorkTeamProjectLinkRepository
  workspace: WorkspaceRepository
  workspaceOwnerMembership: WorkspaceOwnerMembershipRepository
  settings: WorkspaceSettingsRepository
}

export function createWorkspaceRepositories(prismaClient?: PrismaClient): WorkspaceRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    member: new WorkspaceMemberPrismaRepository(prisma),
    identity: new WorkspaceIdentityPrismaRepository(prisma),
    invitation: new WorkspaceInvitationPrismaRepository(prisma),
    license: new WorkspaceLicensePrismaRepository(prisma),
    workTeam: new WorkTeamPrismaRepository(prisma),
    workTeamMembership: new WorkTeamMembershipPrismaRepository(prisma),
    workTeamProjectLink: new WorkTeamProjectLinkPrismaRepository(prisma),
    workspace: new WorkspacePrismaRepository(prisma),
    workspaceOwnerMembership: new WorkspaceOwnerMembershipPrismaRepository(prisma),
    settings: new WorkspaceSettingsPrismaRepository(prisma),
  }
}
