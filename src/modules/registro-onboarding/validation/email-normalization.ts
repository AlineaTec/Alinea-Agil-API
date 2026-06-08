/**
 * Normalización mínima de correo para servidor.
 * TODO [P]: equivalencias (+alias, puntos en Gmail, etc.) — open-questions.md n.º 6.
 */
export function normalizeEmailBasic(raw: string): string {
  return raw.trim().toLowerCase()
}
