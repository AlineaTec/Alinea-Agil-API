import {
  runInPrismaTransaction,
  type PrismaTransactionClient,
} from "../../../infrastructure/postgres/run-prisma-transaction.js"

/**
 * Transacción Prisma (única persistencia). El parámetro `session` se conserva en la firma
 * por compatibilidad con repos que aún aceptan `ClientSession` legacy (= `unknown`).
 */
export async function runWithTransactionPreferred<T>(
  work: (session: unknown) => Promise<T>,
  fallbackWithoutTransaction?: () => Promise<T>,
): Promise<T> {
  try {
    return await runInPrismaTransaction(async (_tx: PrismaTransactionClient) => work(undefined))
  } catch (e) {
    if (fallbackWithoutTransaction) return fallbackWithoutTransaction()
    throw e
  }
}
