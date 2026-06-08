import type { TransactionalEmailOutboundMessageLedger } from "../../modules/transactional-email/persistence/transactional-email-outbound-message.repository.js"
import { TransactionalEmailOutboundMessagePrismaRepository } from "../../modules/transactional-email/persistence/prisma/transactional-email-outbound-message.prisma-repository.js"
import type { PrismaClient } from "@prisma/client"
import { getPrismaClient } from "../postgres/prisma-client.js"
import {
  type PersistenceDriver,
} from "./persistence-driver.js"

export type TransactionalEmailRepositories = {
  driver: PersistenceDriver
  ledger: TransactionalEmailOutboundMessageLedger
}

export function createTransactionalEmailRepositories(
  prismaClient?: PrismaClient,
): TransactionalEmailRepositories {
  const prisma = prismaClient ?? getPrismaClient()
  return {
    driver: "postgres",
    ledger: new TransactionalEmailOutboundMessagePrismaRepository(prisma),
  }
}
