import type { PrismaClient } from "@prisma/client"
import type { ProductFeedbackAuditRepository } from "../../modules/product-feedback/persistence/product-feedback-audit.repository.js"
import type { ProductFeedbackSubmissionRepository } from "../../modules/product-feedback/persistence/product-feedback-submission.repository.js"
import { ProductFeedbackAuditPrismaRepository } from "../../modules/product-feedback/persistence/prisma/product-feedback-audit.prisma-repository.js"
import { ProductFeedbackSubmissionPrismaRepository } from "../../modules/product-feedback/persistence/prisma/product-feedback-submission.prisma-repository.js"
import type { ProductIdeaFeedbackEntryAuditRepository } from "../../modules/product-idea-feedback/persistence/product-idea-feedback-audit.repository.js"
import type { ProductIdeaFeedbackEntryEntryRepository } from "../../modules/product-idea-feedback/persistence/product-idea-feedback-entry.repository.js"
import type { ProductIdeaRepository } from "../../modules/product-idea-feedback/persistence/product-idea.repository.js"
import { ProductIdeaPrismaRepository } from "../../modules/product-idea-feedback/persistence/prisma/product-idea.prisma-repository.js"
import { ProductIdeaFeedbackEntryPrismaRepository } from "../../modules/product-idea-feedback/persistence/prisma/product-idea-feedback-entry.prisma-repository.js"
import { ProductIdeaFeedbackAuditPrismaRepository } from "../../modules/product-idea-feedback/persistence/prisma/product-idea-feedback-audit.prisma-repository.js"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type FeedbackRepositories = {
  driver: PersistenceDriver
  productIdea: ProductIdeaRepository
  productFeedbackSubmission: ProductFeedbackSubmissionRepository
  productFeedbackAudit: ProductFeedbackAuditRepository
  productIdeaFeedbackEntry: ProductIdeaFeedbackEntryEntryRepository
  productIdeaFeedbackAudit: ProductIdeaFeedbackEntryAuditRepository
}

export function createFeedbackRepositories(
  prismaClient?: PrismaClient,
): FeedbackRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    productIdea: new ProductIdeaPrismaRepository(prisma),
      productFeedbackSubmission: new ProductFeedbackSubmissionPrismaRepository(prisma),
      productFeedbackAudit: new ProductFeedbackAuditPrismaRepository(prisma),
      productIdeaFeedbackEntry: new ProductIdeaFeedbackEntryPrismaRepository(prisma),
      productIdeaFeedbackAudit: new ProductIdeaFeedbackAuditPrismaRepository(prisma),
  }
}
