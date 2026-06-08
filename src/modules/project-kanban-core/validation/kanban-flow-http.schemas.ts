import { z } from "zod"

/** Params: workspace + project (mismo criterio que `workspace-project-runtime`). */
export const kanbanFlowPathParamsSchema = z
  .object({
    workspacePublicId: z.string().uuid(),
    projectPublicId: z
      .string()
      .min(1)
      .max(320)
      .refine((id) => id !== "drafts", { message: "projectPublicId cannot be reserved segment `drafts`." }),
  })
  .strict()
