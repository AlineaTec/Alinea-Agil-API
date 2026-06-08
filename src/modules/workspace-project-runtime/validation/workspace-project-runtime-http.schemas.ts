import { z } from "zod"

/** Solo `workspacePublicId` (p. ej. `GET .../projects` listado). */
export const workspaceProjectRuntimeWorkspaceOnlyParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
  })
  .strict()

export const workspaceProjectRuntimePathParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    projectPublicId: z
      .string()
      .min(1)
      .max(320)
      .refine((id) => id !== "drafts", { message: "projectPublicId cannot be reserved segment `drafts`." }),
  })
  .strict()
