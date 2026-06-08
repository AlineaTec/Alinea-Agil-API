import type { IdentityRegistrationIntentStatus, Prisma, PrismaClient } from "@prisma/client"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import type { PlatformAuditService } from "../../platform-users/services/platform-audit.service.js"
import type { IdentityRegistrationIntentPersisted } from "../../registro-onboarding/persistence/mappers/registration-intent.mapper.js"
import { PlatformIdentityRegistrationIntentsDeletionBlockedError } from "../domain/platform-registration-intents.errors.js"
import {
  assertPlatformSessionCanListIdentityRegistrationIntents,
  assertPlatformSessionCanMutateIdentityRegistrationIntents,
} from "../policies/platform-registration-intents.policy.js"

export type PlatformIdentityRegistrationIntentListRowPublic = {
  intentPublicId: string
  emailNormalized: string
  status: string
  modality?: string
  workspaceDisplayName?: string
  workspaceCode?: string
  billingCadence?: string
  teamSeatsPurchased?: number
  paymentProviderRef?: string | null
  provisionedWorkspacePublicId?: string | null
  provisionedUserPublicId?: string | null
  provisionedAt: string | null
  expiresAt: string
  createdAt: string
  updatedAt: string
}

function toIsoSafe(v: Date | string | undefined): string {
  if (v === undefined) return ""
  if (v instanceof Date) return v.toISOString()
  const t = typeof v === "string" ? new Date(v).getTime() : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : ""
}

function rowFromPersisted(
  p: IdentityRegistrationIntentPersisted,
): PlatformIdentityRegistrationIntentListRowPublic {
  return {
    intentPublicId: p.intentPublicId,
    emailNormalized: p.emailNormalized,
    status: p.status,
    modality: p.modality ?? undefined,
    workspaceDisplayName: p.workspaceDisplayName,
    workspaceCode: p.workspaceCode,
    billingCadence: p.billingCadence,
    teamSeatsPurchased: p.teamSeatsPurchased,
    paymentProviderRef: p.paymentProviderRef ?? null,
    provisionedWorkspacePublicId: p.provisionedWorkspacePublicId ?? null,
    provisionedUserPublicId: p.provisionedUserPublicId ?? null,
    provisionedAt: p.provisionedAt ? toIsoSafe(p.provisionedAt) : null,
    expiresAt: toIsoSafe(p.expiresAt),
    createdAt: toIsoSafe(p.createdAt),
    updatedAt: toIsoSafe(p.updatedAt),
  }
}

function hasProvisionedWorkspace(provisionedWorkspacePublicId: string | null | undefined): boolean {
  return typeof provisionedWorkspacePublicId === "string" && provisionedWorkspacePublicId.trim().length > 0
}

const UNPROVISIONED_WHERE: Prisma.IdentityRegistrationIntentWhereInput = {
  OR: [
    { provisioned_workspace_public_id: null },
    { provisioned_workspace_public_id: "" },
  ],
}

function listWhere(input: {
  q?: string
  status?: string
}): Prisma.IdentityRegistrationIntentWhereInput {
  const where: Prisma.IdentityRegistrationIntentWhereInput = {}
  if (input.q?.trim()) {
    where.email_normalized = { contains: input.q.trim(), mode: "insensitive" }
  }
  if (input.status) {
    where.status = input.status as IdentityRegistrationIntentStatus
  }
  return where
}

export class PlatformIdentityRegistrationIntentsAdminService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly platformAudit: PlatformAuditService | null = null,
  ) {}

  async listIdentityRegistrationIntents(
    session: PlatformSessionContext,
    input: { limit: number; offset: number; q?: string | undefined; status?: string },
  ): Promise<{ items: PlatformIdentityRegistrationIntentListRowPublic[]; total: number }> {
    assertPlatformSessionCanListIdentityRegistrationIntents(session)
    const where = listWhere(input)
    const [total, rows] = await Promise.all([
      this.prisma.identityRegistrationIntent.count({ where }),
      this.prisma.identityRegistrationIntent.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: input.offset,
        take: input.limit,
        select: {
          public_id: true,
          email_normalized: true,
          status: true,
          modality: true,
          workspace_display_name: true,
          workspace_code: true,
          billing_cadence: true,
          team_seats_purchased: true,
          payment_provider_ref: true,
          provisioned_workspace_public_id: true,
          provisioned_user_public_id: true,
          provisioned_at: true,
          expires_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
    ])
    const items = rows.map((r) =>
      rowFromPersisted({
        intentPublicId: r.public_id,
        emailNormalized: r.email_normalized,
        status: r.status,
        modality: (r.modality ?? undefined) as IdentityRegistrationIntentPersisted["modality"],
        workspaceDisplayName: r.workspace_display_name ?? undefined,
        workspaceCode: r.workspace_code ?? undefined,
        billingCadence: r.billing_cadence ?? undefined,
        teamSeatsPurchased: r.team_seats_purchased ?? undefined,
        paymentProviderRef: r.payment_provider_ref ?? undefined,
        provisionedUserPublicId: r.provisioned_user_public_id ?? undefined,
        provisionedWorkspacePublicId: r.provisioned_workspace_public_id ?? undefined,
        provisionedAt: r.provisioned_at ?? undefined,
        metadata: {},
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }),
    )
    return { items, total }
  }

  async deleteIdentityRegistrationIntentsByPublicIds(
    session: PlatformSessionContext,
    input: { intentPublicIds: string[]; forceIncludingProvisioned?: boolean },
  ): Promise<{ deletedCount: number; notFoundIntentPublicIds: string[] }> {
    assertPlatformSessionCanMutateIdentityRegistrationIntents(session)
    const unique = [...new Set(input.intentPublicIds)]
    const found = await this.prisma.identityRegistrationIntent.findMany({
      where: { public_id: { in: unique } },
      select: { public_id: true, provisioned_workspace_public_id: true },
    })
    const foundIds = new Set(found.map((d) => d.public_id))
    const notFoundIntentPublicIds = unique.filter((id) => !foundIds.has(id))
    if (found.length === 0) {
      return { deletedCount: 0, notFoundIntentPublicIds }
    }
    if (!input.forceIncludingProvisioned) {
      const blocked = found
        .filter((d) => hasProvisionedWorkspace(d.provisioned_workspace_public_id))
        .map((d) => d.public_id)
      if (blocked.length > 0) {
        throw new PlatformIdentityRegistrationIntentsDeletionBlockedError(
          "provisioned_workspace_blocks_deletion",
          "Hay intents con workspace ya provisionado. Marca fuerza desde la UI solo si conoces el riesgo.",
          blocked,
        )
      }
    }
    const res = await this.prisma.identityRegistrationIntent.deleteMany({
      where: { public_id: { in: [...foundIds] } },
    })
    const out = { deletedCount: res.count, notFoundIntentPublicIds }
    await this.recordPlatformAuditRegistrationMutation(session, "registration.intents_deleted", {
      intentPublicIdsRequested: unique.slice(0, 120),
      forceIncludingProvisioned: !!input.forceIncludingProvisioned,
      deletedCount: out.deletedCount,
      notFoundIntentPublicIds: out.notFoundIntentPublicIds.slice(0, 120),
    })
    return out
  }

  async purgeIdentityRegistrationIntentsWithoutProvisionedWorkspace(
    session: PlatformSessionContext,
  ): Promise<{ deletedCount: number }> {
    assertPlatformSessionCanMutateIdentityRegistrationIntents(session)
    const res = await this.prisma.identityRegistrationIntent.deleteMany({ where: UNPROVISIONED_WHERE })
    const deletedCount = res.count
    await this.recordPlatformAuditRegistrationMutation(session, "registration.intents_purge_unprovisioned", {
      deletedCount,
    })
    return { deletedCount }
  }

  private async recordPlatformAuditRegistrationMutation(
    session: PlatformSessionContext,
    action: "registration.intents_deleted" | "registration.intents_purge_unprovisioned",
    payloadAfter: Record<string, unknown>,
  ): Promise<void> {
    const audit = this.platformAudit
    if (!audit) return
    try {
      const deletedCount = typeof payloadAfter.deletedCount === "number" ? payloadAfter.deletedCount : 0
      const summary =
        action === "registration.intents_deleted"
          ? `Intents de registro eliminados manualmente (${deletedCount} filas)`
          : `Purge de intents sin workspace provisionado (${deletedCount} filas)`
      await audit.recordWorkspaceOperationEvent(
        { platformUserId: session.platformUserId, role: session.role },
        action,
        null,
        summary,
        null,
        payloadAfter,
      )
    } catch {
      /* Auditoría best-effort. */
    }
  }
}
