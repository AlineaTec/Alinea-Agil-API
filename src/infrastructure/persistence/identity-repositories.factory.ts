import type { PrismaClient } from "@prisma/client"
import type { AuthSessionRepository } from "../../modules/login-session/persistence/session.repository.js"
import { AuthSessionPrismaRepository } from "../../modules/login-session/persistence/prisma/auth-session.prisma-repository.js"
import type { IdentityRegisteredUserForAuthRepository } from "../../modules/login-session/persistence/identity-registered-user-for-auth.repository.js"
import { IdentityUserForAuthPrismaRepository } from "../../modules/login-session/persistence/prisma/identity-user-for-auth.prisma-repository.js"
import type { PasswordResetTokenRepository } from "../../modules/login-session/persistence/password-reset-token.repository.js"
import { PasswordResetTokenPrismaRepository } from "../../modules/login-session/persistence/prisma/password-reset-token.prisma-repository.js"
import type { IdentityRegistrationIntentRepository } from "../../modules/registro-onboarding/persistence/registration-intent.repository.js"
import { IdentityRegistrationIntentPrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/registration-intent.prisma-repository.js"
import type { IdentityVerificationChallengeRepository } from "../../modules/registro-onboarding/persistence/identity-verification-challenge.repository.js"
import { IdentityVerificationChallengePrismaRepository } from "../../modules/registro-onboarding/persistence/prisma/identity-verification-challenge.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import type { PersistenceDriver } from "./persistence-driver.js"

export type IdentityRepositories = {
  driver: PersistenceDriver
  registeredUsers: IdentityRegisteredUserForAuthRepository
  sessions: AuthSessionRepository
  resetTokens: PasswordResetTokenRepository
  registrationIntents: IdentityRegistrationIntentRepository
  verificationChallenges: IdentityVerificationChallengeRepository
  registeredUsersPrisma: IdentityUserForAuthPrismaRepository
}

export function createIdentityRepositories(prismaClient?: PrismaClient): IdentityRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  const registeredUsersPrisma = new IdentityUserForAuthPrismaRepository(prisma)
  return {
    driver: "postgres",
    registeredUsers: registeredUsersPrisma,
    sessions: new AuthSessionPrismaRepository(prisma),
    resetTokens: new PasswordResetTokenPrismaRepository(prisma),
    registrationIntents: new IdentityRegistrationIntentPrismaRepository(prisma),
    verificationChallenges: new IdentityVerificationChallengePrismaRepository(prisma),
    registeredUsersPrisma,
  }
}
