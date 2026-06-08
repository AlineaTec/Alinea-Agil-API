import {
  getWorkspaceDisplayNameFormatIssue,
  normalizeWorkspaceDisplayName,
} from "../../registro-onboarding/domain/workspace-identity.policy.js"

export type WorkspaceDisplayNamePolicyIssue =
  | "invalid_display_name"
  | "no_effective_change"

export type WorkspaceDisplayNamePolicyResult =
  | { ok: true; normalized: string }
  | { ok: false; kind: WorkspaceDisplayNamePolicyIssue; message: string }

const INVALID_MSG =
  "El nombre visible del workspace debe tener entre 2 y 100 caracteres tras normalizar espacios."

const NO_CHANGE_MSG = "No hay cambio efectivo respecto al nombre actual del workspace."

/**
 * Normaliza y valida el nombre visible; compara con el actual para detectar no-op.
 */
export function evaluateWorkspaceDisplayNameChange(
  raw: string,
  currentDisplayName: string,
): WorkspaceDisplayNamePolicyResult {
  const normalized = normalizeWorkspaceDisplayName(raw)
  const issue = getWorkspaceDisplayNameFormatIssue(normalized)
  if (issue !== null) {
    return { ok: false, kind: "invalid_display_name", message: INVALID_MSG }
  }
  if (normalized === currentDisplayName) {
    return { ok: false, kind: "no_effective_change", message: NO_CHANGE_MSG }
  }
  return { ok: true, normalized }
}
