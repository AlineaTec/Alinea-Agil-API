/**
 * Logs pensados para agregadores (p. ej. Vercel): una línea JSON por evento.
 * En local, sin VERCEL ni LOG_FORMAT=json, el resto del API puede usar salida legible.
 */

export type LogLevel = "info" | "warn" | "error" | "debug"

/** Vercel define VERCEL=1; también se puede forzar con LOG_FORMAT=json. */
export function useStructuredLogs(): boolean {
  if (process.env.LOG_FORMAT?.toLowerCase() === "json") return true
  return process.env.VERCEL === "1"
}

export function writeStructured(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    service: "alinea-api",
    ...fields,
  })
  if (level === "error") console.error(line)
  else console.log(line)
}
