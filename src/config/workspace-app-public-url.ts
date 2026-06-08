/**
 * URL pública del cliente web (workspace shell). Opcional: si falta, los correos billing
 * orientan a iniciar sesión y abrir Facturación sin deep link absoluto.
 */
export function getWorkspaceAppPublicOrigin(): string | null {
  const raw = process.env.WORKSPACE_APP_PUBLIC_BASE_URL?.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return u.origin
  } catch {
    return null
  }
}

export function workspaceBillingHubUrl(_workspacePublicId: string): string | null {
  const origin = getWorkspaceAppPublicOrigin()
  if (!origin) return null
  return `${origin}/app/workspace/billing`
}
