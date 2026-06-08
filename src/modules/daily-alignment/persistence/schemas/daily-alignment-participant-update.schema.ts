const sourceModeEnum = ["manual", "confirmed_from_suggestion", "mixed"] as const

export type DailyAlignmentParticipantUpdateDocProps = {
  participantUpdatePublicId: string
  sessionPublicId: string
  workspacePublicId: string
  projectPublicId: string
  userPublicId: string
  yesterdaySummary: string
  todayPlan: string
  impediments: string
  suggestionBasisSnapshot: unknown | null
  consistencyHintsSnapshot: unknown | null
  sourceMode: (typeof sourceModeEnum)[number]
  isSubmitted: boolean
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
