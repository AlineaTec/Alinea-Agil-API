import type { GuidedRetrospectiveActionItemState } from "../../domain/guided-retrospective-action-item.js"

export type GuidedRetrospectiveActionItemDocProps = Omit<
  GuidedRetrospectiveActionItemState,
  "createdAt" | "updatedAt"
> & {
  createdAt: Date
  updatedAt: Date
}
