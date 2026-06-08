import type { ContributionVisibilityMode } from "./guided-retrospective-session.js"

export type ContributionTopicStatus = "raw" | "grouped" | "selected_for_vote" | "discussed"

export type GuidedRetrospectiveContributionState = {
  contributionPublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  /** Miembro workspace; cadena vacía = aporte público por código (invitado). */
  authorUserPublicId: string
  /** Solo invitados (`authorUserPublicId` vacío). `null` = anónimo en UI. */
  authorGuestLabel: string | null
  visibilityMode: ContributionVisibilityMode
  templateColumnKey: string
  content: string
  topicPublicId: string | null
  topicStatus: ContributionTopicStatus
  voteCount: number
  createdAt: Date
  updatedAt: Date
}
