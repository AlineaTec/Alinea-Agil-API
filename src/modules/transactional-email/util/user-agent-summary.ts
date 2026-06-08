/**
 * Resumen breve para correo (v1, heurística simple; sin librerías ni fingerprinting).
 */
export function summarizeClientForEmail(userAgent: string | null | undefined): string {
  if (!userAgent?.trim()) return "No recibido"
  const ua = userAgent.trim()
  const lower = ua.toLowerCase()
  const mobile =
    lower.includes("mobile") ||
    lower.includes("android") ||
    lower.includes("iphone") ||
    lower.includes("ipad")
  let browser = "Navegador"
  if (lower.includes("edg/")) browser = "Edge"
  else if (lower.includes("chrome") && !lower.includes("edg")) browser = "Chrome"
  else if (lower.includes("firefox")) browser = "Firefox"
  else if (lower.includes("safari") && !lower.includes("chrome")) browser = "Safari"
  let os = ""
  if (lower.includes("windows")) os = "Windows"
  else if (lower.includes("mac os")) os = "macOS"
  else if (lower.includes("linux") && !lower.includes("android")) os = "Linux"
  else if (lower.includes("android")) os = "Android"
  else if (lower.includes("iphone") || lower.includes("ipad")) os = "iOS"
  const kind = mobile ? "Móvil / tableta" : "Escritorio"
  const parts = [kind, browser, os].filter((p) => p.length > 0)
  return parts.length > 0 ? parts.join(" · ") : ua.length > 100 ? `${ua.slice(0, 97)}…` : ua
}
