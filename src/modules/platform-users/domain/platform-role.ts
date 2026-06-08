import { z } from "zod"

export const platformRoles = [
  "platform_super_admin",
  "platform_operator",
  "platform_auditor",
] as const

export type PlatformRole = (typeof platformRoles)[number]

export const platformRoleSchema = z.enum(platformRoles)
