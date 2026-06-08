import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"
import { assertCanReadProjectRuntime } from "../../workspace-project-runtime/policies/project-runtime-authorization.policy.js"
import { OperatingSnapshotForbiddenError } from "../domain/operating-snapshot.errors.js"

export function assertCanReadOperatingSnapshot(actor: WorkspaceMemberState): void {
  try {
    assertCanReadProjectRuntime(actor)
  } catch {
    throw new OperatingSnapshotForbiddenError()
  }
}
