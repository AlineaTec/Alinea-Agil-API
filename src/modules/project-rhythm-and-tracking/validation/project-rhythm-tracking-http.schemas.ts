import { z } from "zod"

export const rhythmTrackingPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  projectPublicId: z.string().uuid(),
})

export type RhythmTrackingPathParams = z.infer<typeof rhythmTrackingPathParamsSchema>
