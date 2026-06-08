import type { PrismaClient } from "@prisma/client"

export async function resolveProjectId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
): Promise<string | null> {
  const row = await prisma.project.findFirst({
    where: { workspace_public_id: workspacePublicId, public_id: projectPublicId },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveWorkItemId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  workItemPublicId: string,
): Promise<string | null> {
  const row = await prisma.workItem.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: workItemPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveSprintId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sprintPublicId: string,
): Promise<string | null> {
  const row = await prisma.sprint.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sprintPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveKanbanColumnId(
  prisma: PrismaClient,
  projectId: string,
  columnPublicId: string | null | undefined,
): Promise<string | null> {
  if (!columnPublicId) return null
  const row = await prisma.kanbanColumn.findFirst({
    where: { project_id: projectId, public_id: columnPublicId },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveGuidedPlanningSessionId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
): Promise<string | null> {
  const row = await prisma.guidedSprintPlanningSession.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sessionPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}
