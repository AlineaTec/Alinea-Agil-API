import { z } from "zod"

export const assignWorkItemBodySchema = z.object({
  assignedUserPublicId: z.string().uuid(),
})

export type AssignWorkItemBody = z.infer<typeof assignWorkItemBodySchema>

/**
 * `assigneeUserPublicId: null` desasigna. Contrato alineado a project-work-assignment (contracts-docs).
 */
export const patchWorkItemAssignmentBodySchema = z
  .object({
    assigneeUserPublicId: z.string().uuid().nullable(),
  })
  .strict()

export type PatchWorkItemAssignmentBody = z.infer<typeof patchWorkItemAssignmentBodySchema>
