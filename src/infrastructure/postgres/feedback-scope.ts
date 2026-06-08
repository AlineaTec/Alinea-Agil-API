import type { PrismaClient } from "@prisma/client"
import { resolveProjectId } from "./project-scope.js"
import { resolveWorkspaceId } from "./workspace-scope.js"

export type FeedbackWorkspaceProjectIds = {
  workspaceId: string
  projectId: string | null
}

export async function resolveFeedbackWorkspaceProjectIds(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string | null | undefined,
): Promise<FeedbackWorkspaceProjectIds | null> {
  const workspaceId = await resolveWorkspaceId(prisma, workspacePublicId)
  if (!workspaceId) return null
  if (!projectPublicId) {
    return { workspaceId, projectId: null }
  }
  const projectId = await resolveProjectId(prisma, workspacePublicId, projectPublicId)
  if (!projectId) return null
  return { workspaceId, projectId }
}
