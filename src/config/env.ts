/**
 * Carga de configuración.
 * TODO [P]: validar con Zod y archivo .env de entornos (staging/prod).
 */

export function getPort(): number {
  const raw = process.env.PORT
  return raw ? Number.parseInt(raw, 10) || 3000 : 3000
}
