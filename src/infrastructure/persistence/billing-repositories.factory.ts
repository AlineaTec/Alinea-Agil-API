import type { PrismaClient } from "@prisma/client"
import type { BillingNotificationSentRepository } from "../../modules/billing-seat-enforcement/persistence/billing-notification-sent.repository.js"
import type { PaddleWebhookProcessedRepository } from "../../modules/billing-seat-enforcement/persistence/paddle-webhook-processed.repository.js"
import type { WorkspaceBillingAuditRepository } from "../../modules/billing-seat-enforcement/persistence/workspace-billing-audit.repository.js"
import type { WorkspaceBillingSnapshotRepository } from "../../modules/billing-seat-enforcement/persistence/workspace-billing-snapshot.repository.js"
import { BillingNotificationSentPrismaRepository } from "../../modules/billing-seat-enforcement/persistence/prisma/billing-notification-sent.prisma-repository.js"
import { PaddleWebhookProcessedPrismaRepository } from "../../modules/billing-seat-enforcement/persistence/prisma/paddle-webhook-processed.prisma-repository.js"
import { WorkspaceBillingAuditPrismaRepository } from "../../modules/billing-seat-enforcement/persistence/prisma/workspace-billing-audit.prisma-repository.js"
import { WorkspaceBillingSnapshotPrismaRepository } from "../../modules/billing-seat-enforcement/persistence/prisma/workspace-billing-snapshot.prisma-repository.js"
import type { PaymentReceiptYearSequenceRepository } from "../../modules/payment-receipts/persistence/payment-receipt-year-sequence.repository.js"
import type { PaymentReceiptOrphanEventRepository } from "../../modules/payment-receipts/persistence/payment-receipt-orphan.repository.js"
import type { WorkspacePaymentReceiptRepository } from "../../modules/payment-receipts/persistence/workspace-payment-receipt.repository.js"
import { PaymentReceiptOrphanPrismaRepository } from "../../modules/payment-receipts/persistence/prisma/payment-receipt-orphan.prisma-repository.js"
import { PaymentReceiptYearSequencePrismaRepository } from "../../modules/payment-receipts/persistence/prisma/payment-receipt-year-sequence.prisma-repository.js"
import { WorkspacePaymentReceiptPrismaRepository } from "../../modules/payment-receipts/persistence/prisma/workspace-payment-receipt.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type BillingRepositories = {
  driver: PersistenceDriver
  snapshot: WorkspaceBillingSnapshotRepository
  paddleWebhook: PaddleWebhookProcessedRepository
  notificationSent: BillingNotificationSentRepository
  workspaceBillingAudit: WorkspaceBillingAuditRepository
  paymentReceipt: WorkspacePaymentReceiptRepository
  yearSequence: PaymentReceiptYearSequenceRepository
  orphanEvent: PaymentReceiptOrphanEventRepository
}

export function createBillingRepositories(
  prismaClient?: PrismaClient,
): BillingRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    snapshot: new WorkspaceBillingSnapshotPrismaRepository(prisma),
      paddleWebhook: new PaddleWebhookProcessedPrismaRepository(prisma),
      notificationSent: new BillingNotificationSentPrismaRepository(prisma),
      workspaceBillingAudit: new WorkspaceBillingAuditPrismaRepository(prisma),
      paymentReceipt: new WorkspacePaymentReceiptPrismaRepository(prisma),
      yearSequence: new PaymentReceiptYearSequencePrismaRepository(prisma),
      orphanEvent: new PaymentReceiptOrphanPrismaRepository(prisma),
  }
}
