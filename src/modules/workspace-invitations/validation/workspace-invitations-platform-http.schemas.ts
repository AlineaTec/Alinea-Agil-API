import { z } from "zod"
import { WORKSPACE_INVITATION_STATUSES } from "../domain/workspace-invitation-status.js"

export const platformWorkspaceInvitationsListQuerySchema = z.object({
  workspacePublicId: z.string().uuid().optional(),
  status: z.enum(WORKSPACE_INVITATION_STATUSES).optional(),
  q: z.string().max(200).optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export type PlatformWorkspaceInvitationsListQuery = z.infer<typeof platformWorkspaceInvitationsListQuerySchema>

export const platformWorkspaceInvitationWriteParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  invitationPublicId: z.string().uuid(),
})
