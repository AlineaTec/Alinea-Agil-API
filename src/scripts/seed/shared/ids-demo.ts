import { SEED_PLATFORM_EMAIL } from "./credentials.js"

/** UUIDs determinísticos — seed demo ACME S.A. */

export const DEMO = {
  platformUserId: "e1000001-0000-4000-8000-000000000001",
  platformEmail: SEED_PLATFORM_EMAIL,

  intentId: "e2000001-0000-4000-8000-000000000001",
  workspaceId: "e3000001-0000-4000-8000-000000000001",
  workspaceSlug: "acme-demo",
  platformTenantId: "e3000002-0000-4000-8000-000000000001",

  ownerUserId: "e4000001-0000-4000-8000-000000000001",
  ownerEmail: "pruebas@alineatec.com",
  ownerMembershipId: "e5000001-0000-4000-8000-000000000001",

  teamAlphaId: "e6000001-0000-4000-8000-000000000001",
  teamBetaId: "e6000002-0000-4000-8000-000000000002",
  teamAlphaProjectLinkId: "e6020001-0000-4000-8000-000000000001",
  teamBetaKanbanLinkId: "e6020002-0000-4000-8000-000000000002",
  teamBetaScrumLinkId: "e6020003-0000-4000-8000-000000000003",

  invitationPendingId: "e6030001-0000-4000-8000-000000000001",

  kanbanDraftId: "e7000001-0000-4000-8000-000000000001",
  kanbanProjectId: "e8000001-0000-4000-8000-000000000001",
  kanbanColReady: "e8100001-0000-4000-8000-000000000001",
  kanbanColProgress: "e8100002-0000-4000-8000-000000000002",
  kanbanColReview: "e8100003-0000-4000-8000-000000000003",
  kanbanColDone: "e8100004-0000-4000-8000-000000000004",

  scrumDraftId: "e7000002-0000-4000-8000-000000000002",
  scrumProjectId: "e8000002-0000-4000-8000-000000000002",
  epicId: "e9000001-0000-4000-8000-000000000001",
  sprint1Id: "ea000001-0000-4000-8000-000000000001",
  sprint2Id: "ea000002-0000-4000-8000-000000000002",
  sprint3Id: "ea000003-0000-4000-8000-000000000003",

  planningSessionId: "eb000001-0000-4000-8000-000000000001",
  refinementSessionId: "eb000002-0000-4000-8000-000000000001",
  retroSessionId: "eb000003-0000-4000-8000-000000000001",
  dailySessionId: "eb000004-0000-4000-8000-000000000001",
  reviewSessionId: "eb000005-0000-4000-8000-000000000001",

  retroTopic1Id: "eb100001-0000-4000-8000-000000000001",
  retroTopic2Id: "eb100002-0000-4000-8000-000000000002",
  retroContribution1Id: "eb110001-0000-4000-8000-000000000001",
  retroContribution2Id: "eb110002-0000-4000-8000-000000000002",
  retroVote1Id: "eb120001-0000-4000-8000-000000000001",
  retroAction1Id: "eb130001-0000-4000-8000-000000000001",

  nbaSnoozeId: "eb200001-0000-4000-8000-000000000001",

  feedback2Id: "e9040002-0000-4000-8000-000000000002",
  notifKanbanId: "e9019998-0000-4000-8000-000000000098",
  notifAssignedId: "e9019997-0000-4000-8000-000000000097",
} as const

const DEMO_USER_EMAIL_DOMAIN = "alineatec.com"

function deterministicUuid(prefix: string, index: number, suffix = "000000000001"): string {
  const mid = String(index).padStart(4, "0")
  return `${prefix}${mid}-0000-4000-8000-${suffix}`
}

/** Usuarios demo index 1..n (owner = índice 1). */
export function demoUserPublicId(index: number): string {
  return deterministicUuid("e401", index)
}

export function demoUserEmail(index: number): string {
  return index === 1
    ? DEMO.ownerEmail
    : `user${String(index).padStart(2, "0")}@${DEMO_USER_EMAIL_DOMAIN}`
}

export function demoMembershipPublicId(index: number): string {
  return deterministicUuid("e501", index)
}

export function kanbanItemPublicId(index: number): string {
  return deterministicUuid("e901", index)
}

export function scrumStoryPublicId(index: number): string {
  return deterministicUuid("e902", index, "000000000002")
}

export function scrumTaskPublicId(storyIndex: number, taskIndex: number): string {
  return deterministicUuid("e908", storyIndex * 10 + taskIndex, "000000000003")
}

export function workCommentPublicId(projectCode: "k" | "s", index: number): string {
  const prefix = projectCode === "k" ? "e911" : "e912"
  return deterministicUuid(prefix, index)
}

export function workTimeEntryPublicId(projectCode: "k" | "s", index: number): string {
  const prefix = projectCode === "k" ? "e921" : "e922"
  return deterministicUuid(prefix, index)
}

export function impedimentPublicId(index: number): string {
  return deterministicUuid("e930", index, "000000000004")
}
