import type { PrismaClient } from "@prisma/client"

export async function resolveDailyAlignmentSessionId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
): Promise<string | null> {
  const row = await prisma.dailyAlignmentSession.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sessionPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveGuidedRefinementSessionId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
): Promise<string | null> {
  const row = await prisma.guidedRefinementSession.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sessionPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveGuidedReviewSessionId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
): Promise<string | null> {
  const row = await prisma.guidedReviewSession.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sessionPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveGuidedRetrospectiveSessionId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
): Promise<string | null> {
  const row = await prisma.guidedRetrospectiveSession.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      public_id: sessionPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}

export async function resolveGuidedRetrospectiveTopicId(
  prisma: PrismaClient,
  workspacePublicId: string,
  projectPublicId: string,
  sessionPublicId: string,
  topicPublicId: string,
): Promise<string | null> {
  const row = await prisma.guidedRetrospectiveTopic.findFirst({
    where: {
      workspace_public_id: workspacePublicId,
      project_public_id: projectPublicId,
      session_public_id: sessionPublicId,
      public_id: topicPublicId,
    },
    select: { id: true },
  })
  return row?.id ?? null
}
