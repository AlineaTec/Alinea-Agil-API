import type { PrismaClient } from "@prisma/client"
import { getPrismaClient } from "./prisma-client.js"

export type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient["$transaction"]>[0]
>[0]

/**
 * Ejecuta trabajo en una transacción Prisma (única persistencia soportada).
 */
export async function runInPrismaTransaction<T>(
  work: (tx: PrismaTransactionClient) => Promise<T>,
  prisma: PrismaClient = getPrismaClient(),
): Promise<T> {
  return prisma.$transaction(work)
}
