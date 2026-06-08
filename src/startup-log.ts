/** Salida de arranque: legible en local; una línea JSON por paso en Vercel / LOG_FORMAT=json. */

import { useStructuredLogs, writeStructured } from "./logger.js"

const RULE = "────────────────────────────────────────"

function logStartupSection(title: string): void {
  console.log("")
  console.log(`  ${title}`)
  console.log(`  ${RULE}`)
}

function logStartupField(label: string, value: string): void {
  const pad = label.length <= 26 ? " ".repeat(26 - label.length) : ""
  console.log(`    ${label}${pad}  ${value}`)
}

export function startupLogBegin(): void {
  if (useStructuredLogs()) {
    writeStructured("info", "startup", {
      step: "banner",
      message: "Alinea Ágil — API",
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
    })
    return
  }
  console.log("")
  console.log("  ========================================")
  console.log("  Alinea Ágil — API")
  console.log("  ========================================")
}

type StartupScalar = string | number | boolean | null | undefined

export function startupLogStep(
  step: string,
  fields: Record<string, StartupScalar>,
): void {
  if (useStructuredLogs()) {
    const cleaned = Object.fromEntries(
      Object.entries(fields).filter(
        ([, v]) => v !== undefined && v !== null && v !== "",
      ),
    ) as Record<string, string | number | boolean>
    writeStructured("info", "startup", { step, ...cleaned })
    return
  }
  logStartupSection(step)
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue
    logStartupField(k, String(v))
  }
}

export function startupLogReady(listenUrl: string): void {
  if (useStructuredLogs()) {
    writeStructured("info", "startup", { step: "ready", listenUrl })
    return
  }
  console.log("")
  logStartupField("Escuchando", listenUrl)
  console.log("")
  console.log("  ─── Listo para recibir tráfico ───")
  console.log("")
}

/** Oculta contraseña en URIs de base de datos con usuario embebido. */
export function redactMongoUri(uri: string): string {
  return uri.replace(
    /^(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i,
    "$1$2:***@",
  )
}

/** Oculta contraseña en URIs `postgresql://` / `postgres://`. */
export function redactPostgresUri(uri: string): string {
  return uri.replace(/:([^:@/]+)@/, ":***@")
}

export function redactEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const head = local.slice(0, 1)
  return `${head}***@${domain}`
}
