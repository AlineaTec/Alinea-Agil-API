import { z } from "zod"

export const platformUserStatuses = ["pending_activation", "active", "inactive"] as const

export type PlatformUserStatus = (typeof platformUserStatuses)[number]

export const platformUserStatusSchema = z.enum(platformUserStatuses)
