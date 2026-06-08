import type { OperationalApproach } from "../../workspace-project-runtime/domain/operational-approach.js"

export const GUIDED_RETROSPECTIVE_DEFAULT_SLOT = "default" as const

export type GuidedRetrospectiveSessionStatus =
  | "planned"
  | "open"
  | "collecting"
  | "voting"
  | "closing"
  | "closed"
  | "closed_without_actions"

export type GuidedRetrospectiveMode = "classic" | "interactive_code" | "async"

export type ContributionVisibilityMode = "visible_to_all" | "hidden_from_peers"

export type GuidedRetrospectiveAdditiveNote = {
  noteText: string
  createdByUserPublicId: string
  createdAt: Date
}

/** Transcripción registrada tras el cierre (un solo bloque; se sustituye al guardar). */
export type GuidedRetrospectiveTranscriptAfterClose = {
  text: string
  updatedAt: Date
  updatedByUserPublicId: string
}

/** Optional Kanban / flow window (no sprint artificial) — OQ-GRETRO-16. */
export type RetrospectivePeriodWindow = {
  periodStartYmd: string
  periodEndYmd: string
}

export type GuidedRetrospectiveSessionState = {
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  sessionDate: string
  sessionSlot: string
  sprintPublicId: string | null
  retrospectivePeriod: RetrospectivePeriodWindow | null
  operationalApproach: OperationalApproach
  operationalTimeZone: string
  retrospectiveMode: GuidedRetrospectiveMode
  facilitatorUserPublicId: string | null
  status: GuidedRetrospectiveSessionStatus
  templateKey: string
  sessionCode: string | null
  votesPerParticipant: number
  allowMultipleVotesPerTopic: boolean
  defaultContributionVisibility: ContributionVisibilityMode
  goalSummary: string | null
  summary: string | null
  agreements: string[]
  participantUserPublicIds: string[]
  participantWithContributionUserPublicIds: string[]
  participantCount: number
  participantWithContributionCount: number
  contributionCount: number
  topicCount: number
  /** Filas de voto (participación); pegatinas totales = suma de `stickerWeight`. */
  voteRecordCount: number
  sessionVoteStickerTotal: number
  startedAt: Date | null
  closedAt: Date | null
  /** Transcripción única post-cierre (sustituible; ver notas aditivas aparte). */
  transcriptAfterClose: GuidedRetrospectiveTranscriptAfterClose | null
  additiveNotesAfterClose: GuidedRetrospectiveAdditiveNote[]
  /** Lightweight insumos (OQ-GRETRO-17) — no narrativa automática. */
  contextHints: Record<string, string> | null
  createdAt: Date
  updatedAt: Date
}
