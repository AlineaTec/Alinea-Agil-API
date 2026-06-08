export const WIZARD_STAGES = [
  "configure",
  "prepare",
  "commit",
  "execute",
  "close",
  "improve",
] as const

export type WizardStage = (typeof WIZARD_STAGES)[number]

export const DERIVATION_VERSION = "wizard-derivation-v1" as const

export const SNAPSHOT_TTL_SECONDS = 30 as const

export const CLOSED_RECENT_DAYS = 14 as const

export const DAILY_PENDING_THRESHOLD_HOUR = 14 as const

export const MAX_ALERTS_IN_RESPONSE = 10 as const

export const MAX_ALERTS_IN_HUB = 5 as const
