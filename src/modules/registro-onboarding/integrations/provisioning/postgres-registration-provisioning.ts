import { randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import {
  assertCanAssignSeats,
  assertPurchasedCoversAssigned,
} from "../../../workspace-licenses/domain/seat-capacity.policy.js"
import { nextFirstOfMonthUtc } from "../../../workspace-licenses/domain/monthly-renewal.policy.js"
import { workspaceLicenseToPrisma } from "../../../workspace-licenses/persistence/prisma/workspace-license.prisma-mapper.js"
import { assertWorkspaceRoleXor } from "../../../workspace-users/domain/workspace-member-role.policy.js"
import { assertStatusSeatAlignment } from "../../../workspace-users/domain/workspace-member-status.policy.js"
import { assertAtMostOneOtherAdmin } from "../../../workspace-users/domain/workspace-member-admin.policy.js"
import { normalizeEmailBasic } from "../../validation/email-normalization.js"
import { workspaceMemberToPrismaCreate } from "../../../workspace-users/persistence/prisma/workspace-member.prisma-mapper.js"
import { createRegisterPlatformTenantHook } from "../../../platform-tenants/integrations/register-platform-tenant.js"
import { seatsForNewWorkspaceFromIntent } from "../../../commercial-pricing/compute-commercial-quote.js"
import { defaultIntentExpiry } from "../../services/registration-intent-ttl.js"
import type {
  PaidRegistrationProvisionPayload,
  PaidRegistrationProvisionResult,
  RegistrationProvisioningPort,
} from "./provisioning.port.js"
import type { RegisterPlatformTenantHook } from "../../../platform-tenants/integrations/register-platform-tenant.js"

/**
 * Materializa usuario, workspace, owner membership, licencia y miembro operativo en PostgreSQL (una transacción).
 * `platform_tenants` según `PLATFORM_PERSISTENCE_DRIVER` (hook inyectable en tests).
 */
export class PostgresRegistrationProvisioning implements RegistrationProvisioningPort {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registerPlatformTenant: RegisterPlatformTenantHook = createRegisterPlatformTenantHook(
      prisma,
    ),
  ) {}

  async provisionPaidRegistration(
    payload: PaidRegistrationProvisionPayload,
  ): Promise<PaidRegistrationProvisionResult> {
    const userPublicId = randomUUID()
    const workspacePublicId = randomUUID()
    const membershipPublicId = randomUUID()
    const now = new Date()

    const prior = payload.priorMetadata ?? {}
    const seatsPurchased = seatsForNewWorkspaceFromIntent({
      modality: payload.modality,
      teamSeatsPurchased: payload.teamSeatsPurchased,
      planTier: payload.planTier,
    })

    await this.prisma.$transaction(async (tx) => {
      await tx.identityUser.create({
        data: {
          public_id: userPublicId,
          email_normalized: payload.emailNormalized,
          full_name: payload.accountFullName,
          password_hash: payload.passwordHash,
          modality_at_signup: payload.modality,
          source_registration_intent_public_id: payload.intentPublicId,
        },
      })

      await tx.workspace.create({
        data: {
          public_id: workspacePublicId,
          slug: payload.workspaceCode,
          display_name: payload.workspaceDisplayName,
          modality: payload.modality,
          billing_cadence: payload.billingCadence,
          source_registration_intent_public_id: payload.intentPublicId,
        },
      })

      const workspaceId = (
        await tx.workspace.findUniqueOrThrow({
          where: { public_id: workspacePublicId },
          select: { id: true },
        })
      ).id

      await tx.workspaceOwnerMembership.create({
        data: {
          public_id: membershipPublicId,
          workspace_id: workspaceId,
          user_public_id: userPublicId,
          role: "owner",
        },
      })

      const existingLicense = await tx.workspaceLicense.findUnique({
        where: { workspace_public_id: workspacePublicId },
      })
      if (!existingLicense) {
        const purchased = seatsPurchased
        const assigned = 1
        assertPurchasedCoversAssigned(purchased, assigned)
        assertCanAssignSeats(
          {
            workspacePublicId,
            seatsPurchased: purchased,
            seatsAssigned: 0,
            pendingSeatReduction: null,
            nextRenewalDate: nextFirstOfMonthUtc(now),
            lastRenewalAt: null,
          },
          assigned,
        )
        await tx.workspaceLicense.create({
          data: workspaceLicenseToPrisma(
            {
              workspacePublicId,
              seatsPurchased: purchased,
              seatsAssigned: assigned,
              pendingSeatReduction: null,
              nextRenewalDate: nextFirstOfMonthUtc(now),
              lastRenewalAt: null,
            },
            workspaceId,
          ),
        })
      }

      const existingMember = await tx.workspaceMember.findUnique({
        where: { public_id: membershipPublicId },
      })
      if (!existingMember) {
        const memberState = {
          membershipPublicId,
          workspacePublicId,
          userPublicId,
          emailNormalized: normalizeEmailBasic(payload.emailNormalized),
          fullName: payload.accountFullName.trim(),
          status: "active" as const,
          hasSeatAssigned: true,
          workspaceRoleAdministrative: "admin" as const,
          workspaceRoleMethodological: null,
          createdAt: now,
          updatedAt: now,
        }
        assertWorkspaceRoleXor(
          memberState.workspaceRoleAdministrative,
          memberState.workspaceRoleMethodological,
        )
        assertStatusSeatAlignment(memberState)
        await assertAtMostOneOtherAdmin({
          assigningAdmin: true,
          countOtherActiveAdmins: async () => 0,
        })
        await tx.workspaceMember.create({
          data: workspaceMemberToPrismaCreate(memberState, workspaceId),
        })
      }

      const activationMetadata = {
        ...prior,
        activation: {
          completedAtIso: now.toISOString(),
          userPublicId,
          workspacePublicId,
          membershipPublicId,
        },
      }

      const updated = await tx.identityRegistrationIntent.updateMany({
        where: {
          public_id: payload.intentPublicId,
          status: "PAYMENT_SUCCEEDED",
          expires_at: { gt: now },
        },
        data: {
          status: "ACTIVE",
          provisioned_user_public_id: userPublicId,
          provisioned_workspace_public_id: workspacePublicId,
          provisioned_at: now,
          expires_at: defaultIntentExpiry(now),
          metadata: activationMetadata as Prisma.InputJsonValue,
        },
      })

      if (updated.count === 0) {
        throw new Error("registration_intent_not_payment_succeeded")
      }
    })

    await this.registerPlatformTenant(workspacePublicId)

    return {
      userPublicId,
      workspacePublicId,
      membershipPublicId,
      membershipRole: "owner",
    }
  }
}
