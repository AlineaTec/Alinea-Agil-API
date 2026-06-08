import type { GuidedRetrospectiveVoteState } from "../../domain/guided-retrospective-vote.js"

export type GuidedRetrospectiveVoteDocProps = Omit<GuidedRetrospectiveVoteState, "createdAt" | "updatedAt"> & {
  createdAt: Date
  updatedAt: Date
}
