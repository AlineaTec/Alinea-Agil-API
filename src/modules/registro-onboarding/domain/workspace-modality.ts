/**
 * Modalidad de workspace (Fase C).
 * `team` sustituye a `empresa` en producto; `empresa` sigue pudiendo existir en datos legacy.
 */
export const WORKSPACE_MODALITIES = ["individual", "team"] as const

/** Valores que pueden aparecer persistidos (incl. legado). */
export const WORKSPACE_MODALITIES_DB = ["individual", "team", "empresa"] as const

export type WorkspaceModality = (typeof WORKSPACE_MODALITIES)[number]

export function normalizeWorkspaceModality(
  raw: string | undefined | null,
): WorkspaceModality | undefined {
  if (raw === undefined || raw === null) return undefined
  if (raw === "empresa") return "team"
  if (raw === "individual" || raw === "team") return raw
  return undefined
}
