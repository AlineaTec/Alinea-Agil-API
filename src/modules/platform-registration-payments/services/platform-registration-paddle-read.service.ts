import type { Prisma, PrismaClient } from "@prisma/client"
import type { PlatformSessionContext } from "../../platform-users/domain/platform-session.context.js"
import { identityRegistrationIntentRowToPersisted } from "../../registro-onboarding/persistence/prisma/registration-intent.prisma-mapper.js"
import { assertPlatformSessionCanReadRegistrationPaddle } from "../policies/platform-registration-paddle.policy.js"

export type PlatformRegistrationPaddlePaymentRowPublic = {
  intentPublicId: string
  emailNormalized: string
  status: string
  modality?: string
  workspaceDisplayName?: string
  workspaceCode?: string
  billingCadence?: string
  teamSeatsPurchased?: number
  paymentProviderRef?: string | null
  paddlePaymentAudit: unknown | null
  commercialSnapshotAtPayment: unknown | null
  provisionedWorkspacePublicId?: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
}

function toIsoSafe(v: Date | string | undefined): string {
  if (v === undefined) return ""
  if (v instanceof Date) return v.toISOString()
  const t = typeof v === "string" ? new Date(v).getTime() : NaN
  return Number.isFinite(t) ? new Date(t).toISOString() : ""
}

const PADDLE_WHERE: Prisma.IdentityRegistrationIntentWhereInput = {
  payment_provider_ref: { startsWith: "paddle:" },
}

export class PlatformRegistrationPaddleReadService {
  constructor(private readonly prisma: PrismaClient) {}

  async listPaddlePayments(
    session: PlatformSessionContext,
    input: { limit: number; offset: number },
  ): Promise<{ items: PlatformRegistrationPaddlePaymentRowPublic[]; total: number }> {
    assertPlatformSessionCanReadRegistrationPaddle(session)
    const [total, rows] = await Promise.all([
      this.prisma.identityRegistrationIntent.count({ where: PADDLE_WHERE }),
      this.prisma.identityRegistrationIntent.findMany({
        where: PADDLE_WHERE,
        orderBy: { updated_at: "desc" },
        skip: input.offset,
        take: input.limit,
      }),
    ])
    const items = rows.map((row) => {
      const p = identityRegistrationIntentRowToPersisted(row)
      const md = p.metadata ?? {}
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
        paddlePaymentAudit: md.paddlePaymentAudit !== undefined ? md.paddlePaymentAudit : null,
        commercialSnapshotAtPayment:
          md.commercialSnapshotAtPayment !== undefined ? md.commercialSnapshotAtPayment : null,
        provisionedWorkspacePublicId: p.provisionedWorkspacePublicId ?? null,
        createdAt: toIsoSafe(p.createdAt),
        updatedAt: toIsoSafe(p.updatedAt),
        expiresAt: toIsoSafe(p.expiresAt),
      }
    })
    return { items, total }
  }
}
