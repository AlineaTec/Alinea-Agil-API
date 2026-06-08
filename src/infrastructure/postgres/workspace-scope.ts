import type { PrismaClient } from "@prisma/client"

export async function resolveWorkspaceId(
  prisma: PrismaClient,
  workspacePublicId: string,
): Promise<string | null> {
  const row = await prisma.workspace.findUnique({
    where: { public_id: workspacePublicId },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveWorkTeamId(
  prisma: PrismaClient,
  workspacePublicId: string,
  teamPublicId: string,
): Promise<string | null> {
  const row = await prisma.workTeam.findFirst({
    where: { workspace_public_id: workspacePublicId, public_id: teamPublicId },
    select: { id: true },
  })
  return row?.id ?? null
}
