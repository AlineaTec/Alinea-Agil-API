import { WorkspaceUserConflictError } from "./workspace-user.errors.js"

/**
 * Solo puede existir un `admin` administrativo activo (no desactivado) por workspace.
 * No se puede dejar el workspace sin ningún admin (WU-ROLE-03).
 */
export async function assertAtMostOneOtherAdmin(options: {
  countOtherActiveAdmins: () => Promise<number>
  assigningAdmin: boolean
}): Promise<void> {
  if (!options.assigningAdmin) return
  const n = await options.countOtherActiveAdmins()
  if (n >= 1) {
    throw new WorkspaceUserConflictError("workspace already has an active administrative admin")
  }
}

export async function assertNotRemovingLastAdmin(options: {
  isCurrentlyAdmin: boolean
  countOtherActiveAdmins: () => Promise<number>
}): Promise<void> {
  if (!options.isCurrentlyAdmin) return
  const others = await options.countOtherActiveAdmins()
  if (others === 0) {
    throw new WorkspaceUserConflictError("cannot remove or deactivate the last workspace admin")
  }
}
