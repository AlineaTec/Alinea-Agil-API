import type { GuidedRetrospectiveContributionState } from "../../domain/guided-retrospective-contribution.js"

export type GuidedRetrospectiveContributionDocProps = Omit<
  GuidedRetrospectiveContributionState,
  "createdAt" | "updatedAt"
> & {
  createdAt: Date
  updatedAt: Date
}
