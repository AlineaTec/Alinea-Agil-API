import type { Prisma, PrismaClient } from "@prisma/client"
import { resolveWorkspaceId } from "../../../../infrastructure/postgres/workspace-scope.js"
import type { WorkspacePaymentReceiptProps } from "../../domain/workspace-payment-receipt.js"
import { PaymentReceiptDuplicateEmissionError } from "../../domain/payment-receipt.errors.js"
import type {
  PlatformPaymentReceiptListFilter,
  WorkspacePaymentReceiptListCursor,
  WorkspacePaymentReceiptListFilter,
  WorkspacePaymentReceiptRepository,
} from "../workspace-payment-receipt.repository.js"

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2002"
}

type ReceiptRow = {
  public_id: string
  receipt_number: string
  workspace_public_id: string
  billing_source: string
  payment_provider: string
  provider_transaction_id: string
  provider_subscription_id: string | null
  issued_at: Date
  status: string
  currency_code: string
  amount_paid_minor: string
  subtotal_minor: string | null
  tax_amount_minor: string | null
  customer_name: string
  customer_email: string | null
  workspace_name: string
  plan_kind: string
  billing_cadence: string | null
  included_seats: number
  additional_seats: number
  period_start: Date | null
  period_end: Date | null
  document_format: string
  pdf_storage_key: string | null
  pdf_generated_at: Date | null
  email_sent_at: Date | null
  source_event_id: string | null
  source_event_type: string | null
  created_at: Date
  updated_at: Date
}

function rowToProps(row: ReceiptRow): WorkspacePaymentReceiptProps {
  return {
    receiptPublicId: row.public_id,
    receiptNumber: row.receipt_number,
    workspacePublicId: row.workspace_public_id,
    billingSource: row.billing_source as WorkspacePaymentReceiptProps["billingSource"],
    paymentProvider: row.payment_provider as WorkspacePaymentReceiptProps["paymentProvider"],
    providerTransactionId: row.provider_transaction_id,
    providerSubscriptionId: row.provider_subscription_id,
    issuedAt: row.issued_at,
    status: row.status as WorkspacePaymentReceiptProps["status"],
    currencyCode: row.currency_code,
    amountPaidMinor: row.amount_paid_minor,
    subtotalMinor: row.subtotal_minor,
    taxAmountMinor: row.tax_amount_minor,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    workspaceName: row.workspace_name,
    planKind: row.plan_kind,
    billingCadence: row.billing_cadence,
    includedSeats: row.included_seats,
    additionalSeats: row.additional_seats,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    documentFormat: row.document_format as WorkspacePaymentReceiptProps["documentFormat"],
    pdfStorageKey: row.pdf_storage_key,
    pdfGeneratedAt: row.pdf_generated_at,
    emailSentAt: row.email_sent_at,
    sourceEventId: row.source_event_id,
    sourceEventType: row.source_event_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function issuedRangeFilter(
  issuedFrom?: Date | null,
  issuedTo?: Date | null,
): Prisma.PaymentWorkspaceReceiptWhereInput | undefined {
  if (!issuedFrom && !issuedTo) return undefined
  const issued_at: Prisma.DateTimeFilter = {}
  if (issuedFrom) issued_at.gte = issuedFrom
  if (issuedTo) issued_at.lte = issuedTo
  return { issued_at }
}

function cursorFilter(cursor: WorkspacePaymentReceiptListCursor): Prisma.PaymentWorkspaceReceiptWhereInput {
  return {
    OR: [
      { issued_at: { lt: cursor.issuedAt } },
      {
        AND: [{ issued_at: cursor.issuedAt }, { public_id: { lt: cursor.receiptPublicId } }],
      },
    ],
  }
}

function mergeWhere(...parts: Array<Prisma.PaymentWorkspaceReceiptWhereInput | undefined>): Prisma.PaymentWorkspaceReceiptWhereInput {
  const active = parts.filter((p): p is Prisma.PaymentWorkspaceReceiptWhereInput => p !== undefined)
  if (active.length === 0) return {}
  if (active.length === 1) return active[0]!
  return { AND: active }
}

export class WorkspacePaymentReceiptPrismaRepository implements WorkspacePaymentReceiptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async insertNew(
    props: Omit<WorkspacePaymentReceiptProps, "createdAt" | "updatedAt">,
  ): Promise<WorkspacePaymentReceiptProps> {
    const workspaceId = await resolveWorkspaceId(this.prisma, props.workspacePublicId)
    if (!workspaceId) throw new Error(`workspace_not_found:${props.workspacePublicId}`)
    const now = new Date()
    try {
      const row = await this.prisma.paymentWorkspaceReceipt.create({
        data: {
          public_id: props.receiptPublicId,
          receipt_number: props.receiptNumber,
          workspace_id: workspaceId,
          workspace_public_id: props.workspacePublicId,
          billing_source: props.billingSource,
          payment_provider: props.paymentProvider,
          provider_transaction_id: props.providerTransactionId,
          provider_subscription_id: props.providerSubscriptionId,
          issued_at: props.issuedAt,
          status: props.status,
          currency_code: props.currencyCode,
          amount_paid_minor: props.amountPaidMinor,
          subtotal_minor: props.subtotalMinor,
          tax_amount_minor: props.taxAmountMinor,
          customer_name: props.customerName,
          customer_email: props.customerEmail,
          workspace_name: props.workspaceName,
          plan_kind: props.planKind,
          billing_cadence: props.billingCadence,
          included_seats: props.includedSeats,
          additional_seats: props.additionalSeats,
          period_start: props.periodStart,
          period_end: props.periodEnd,
          document_format: props.documentFormat,
          pdf_storage_key: props.pdfStorageKey,
          pdf_generated_at: props.pdfGeneratedAt,
          email_sent_at: props.emailSentAt,
          source_event_id: props.sourceEventId,
          source_event_type: props.sourceEventType,
          created_at: now,
          updated_at: now,
        },
      })
      return rowToProps(row as ReceiptRow)
    } catch (err: unknown) {
      if (isUniqueViolation(err)) throw new PaymentReceiptDuplicateEmissionError()
      throw err
    }
  }

  async findByProviderTransaction(
    paymentProvider: string,
    providerTransactionId: string,
  ): Promise<WorkspacePaymentReceiptProps | null> {
    const row = await this.prisma.paymentWorkspaceReceipt.findUnique({
      where: {
        payment_provider_provider_transaction_id: {
          payment_provider: paymentProvider,
          provider_transaction_id: providerTransactionId,
        },
      },
    })
    return row ? rowToProps(row as ReceiptRow) : null
  }

  async findByReceiptPublicId(receiptPublicId: string): Promise<WorkspacePaymentReceiptProps | null> {
    const row = await this.prisma.paymentWorkspaceReceipt.findUnique({
      where: { public_id: receiptPublicId },
    })
    return row ? rowToProps(row as ReceiptRow) : null
  }

  private async listWithWhere(
    where: Prisma.PaymentWorkspaceReceiptWhereInput,
    limit: number,
    cursor?: WorkspacePaymentReceiptListCursor | null,
  ): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: WorkspacePaymentReceiptListCursor | null }> {
    const fullWhere = mergeWhere(where, cursor ? cursorFilter(cursor) : undefined)
    const rows = await this.prisma.paymentWorkspaceReceipt.findMany({
      where: fullWhere,
      orderBy: [{ issued_at: "desc" }, { public_id: "desc" }],
      take: limit + 1,
    })
    const items = rows.slice(0, limit).map((r) => rowToProps(r as ReceiptRow))
    const last = items[items.length - 1]
    const hasMore = rows.length > limit
    const nextCursor: WorkspacePaymentReceiptListCursor | null =
      hasMore && last ? { issuedAt: last.issuedAt, receiptPublicId: last.receiptPublicId } : null
    return { items, nextCursor }
  }

  async findByWorkspace(
    filter: WorkspacePaymentReceiptListFilter,
  ): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: WorkspacePaymentReceiptListCursor | null }> {
    return this.listWithWhere(
      mergeWhere(
        { workspace_public_id: filter.workspacePublicId },
        issuedRangeFilter(filter.issuedFrom, filter.issuedTo),
      ),
      filter.limit,
      filter.cursor,
    )
  }

  async findPlatformList(
    filter: PlatformPaymentReceiptListFilter,
  ): Promise<{ items: WorkspacePaymentReceiptProps[]; nextCursor: WorkspacePaymentReceiptListCursor | null }> {
    const base: Prisma.PaymentWorkspaceReceiptWhereInput = {}
    if (filter.workspacePublicId) base.workspace_public_id = filter.workspacePublicId
    if (filter.billingSource) base.billing_source = filter.billingSource
    if (filter.paymentProvider) base.payment_provider = filter.paymentProvider
    return this.listWithWhere(
      mergeWhere(base, issuedRangeFilter(filter.issuedFrom, filter.issuedTo)),
      filter.limit,
      filter.cursor,
    )
  }

  async updatePdfMetadata(
    receiptPublicId: string,
    patch: { pdfStorageKey: string; pdfGeneratedAt: Date; status: WorkspacePaymentReceiptProps["status"] },
  ): Promise<void> {
    await this.prisma.paymentWorkspaceReceipt.update({
      where: { public_id: receiptPublicId },
      data: {
        pdf_storage_key: patch.pdfStorageKey,
        pdf_generated_at: patch.pdfGeneratedAt,
        status: patch.status,
      },
    })
  }

  async markEmailSent(receiptPublicId: string, sentAt: Date): Promise<void> {
    await this.prisma.paymentWorkspaceReceipt.update({
      where: { public_id: receiptPublicId },
      data: { email_sent_at: sentAt },
    })
  }
}
