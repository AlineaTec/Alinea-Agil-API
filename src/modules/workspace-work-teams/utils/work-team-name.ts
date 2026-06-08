/**
 * Nombre canónico para unicidad: trim + case-insensitive comparación a nivel de workspace
 * (persistido en `nameNormalized` minúsculas).
 */
export function normalizeWorkTeamNameForUniqueness(name: string): string {
  return name.trim().toLowerCase()
}
