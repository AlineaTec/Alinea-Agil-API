export const ACCEPTANCE_CRITERION_STATUSES = ["pending", "done", "reviewed"] as const
export type AcceptanceCriterionStatus = (typeof ACCEPTANCE_CRITERION_STATUSES)[number]

export function isAcceptanceCriterionStatus(value: string): value is AcceptanceCriterionStatus {
  return (ACCEPTANCE_CRITERION_STATUSES as readonly string[]).includes(value)
}
