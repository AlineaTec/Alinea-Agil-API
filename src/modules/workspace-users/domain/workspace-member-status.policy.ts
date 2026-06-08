import type { WorkspaceMemberState } from "./workspace-member.js"
import type { WorkspaceMemberStatus } from "./workspace-member-status.js"
import { WorkspaceUserInvariantError } from "./workspace-user.errors.js"

const ALLOWED_TRANSITIONS: Record<WorkspaceMemberStatus, WorkspaceMemberStatus[]> = {
  pending: ["active", "active_without_seat", "deactivated"],
  active: ["active_without_seat", "deactivated"],
  active_without_seat: ["active", "deactivated"],
  deactivated: ["active_without_seat", "pending"],
}

export function assertStatusTransitionAllowed(from: WorkspaceMemberStatus, to: WorkspaceMemberStatus): void {
  if (from === to) return
  const next = ALLOWED_TRANSITIONS[from]
  if (!next.includes(to)) {
    throw new WorkspaceUserInvariantError(`invalid status transition: ${from} -> ${to}`)
  }
}

/** Coherencia estado ↔ asiento (cerrado en contracts-docs). */
export function assertStatusSeatAlignment(member: Pick<WorkspaceMemberState, "status" | "hasSeatAssigned">): void {
  const { status, hasSeatAssigned } = member
  if (status === "active" && !hasSeatAssigned) {
    throw new WorkspaceUserInvariantError("status active requires hasSeatAssigned")
  }
  if (status === "active_without_seat" && hasSeatAssigned) {
    throw new WorkspaceUserInvariantError("status active_without_seat requires no seat")
  }
  if (status === "deactivated" && hasSeatAssigned) {
    throw new WorkspaceUserInvariantError("deactivated members must not hold a seat")
  }
}
