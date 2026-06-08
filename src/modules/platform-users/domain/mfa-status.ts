import { z } from "zod"

export const mfaStatuses = ["not_enrolled", "enrolled"] as const

export type MfaStatus = (typeof mfaStatuses)[number]

export const mfaStatusSchema = z.enum(mfaStatuses)
