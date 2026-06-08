import type { ImpedimentStatus } from "./impediment.js"
import { ImpedimentValidationError } from "./impediment.errors.js"

const ACTIVE: ImpedimentStatus[] = ["open", "in_review", "mitigating"]

export function isActiveStatus(s: ImpedimentStatus): boolean {
  return ACTIVE.includes(s)
}

export function assertValidActiveToActiveTransition(from: ImpedimentStatus, to: ImpedimentStatus): void {
  if (!isActiveStatus(from) || !isActiveStatus(to)) {
    throw new ImpedimentValidationError("Invalid status transition for this operation.")
  }
}

export function assertCanResolveOrDismiss(from: ImpedimentStatus): void {
  if (!isActiveStatus(from)) {
    throw new ImpedimentValidationError("Only active impediments can be resolved or dismissed.")
  }
}

export function assertCanReopen(from: ImpedimentStatus): void {
  if (from !== "resolved" && from !== "dismissed") {
    throw new ImpedimentValidationError("Only resolved or dismissed impediments can be reopened.")
  }
}
