import { z } from "zod"

export const workspaceSettingsPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const patchWorkspaceDisplayNameBodySchema = z.object({
  workspaceDisplayName: z.string(),
})
