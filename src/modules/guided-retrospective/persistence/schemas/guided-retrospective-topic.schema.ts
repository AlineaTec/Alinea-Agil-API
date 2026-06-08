import type { GuidedRetrospectiveTopicState } from "../../domain/guided-retrospective-topic.js"

export type GuidedRetrospectiveTopicDocProps = Omit<GuidedRetrospectiveTopicState, "createdAt" | "updatedAt"> & {
  createdAt: Date
  updatedAt: Date
}
