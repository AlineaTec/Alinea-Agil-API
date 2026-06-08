import type { GuidedRetrospectiveSessionState,  } from "../../domain/guided-retrospective-session.js"

export type GuidedRetrospectiveSessionDocProps = Omit<
  GuidedRetrospectiveSessionState,
  "createdAt" | "updatedAt"
> & {
  createdAt: Date
  updatedAt: Date
}
