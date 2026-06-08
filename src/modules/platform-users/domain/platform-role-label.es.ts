import type { PlatformRole } from "./platform-role.js"

export function platformRoleLabelEs(role: PlatformRole): string {
  if (role === "platform_super_admin") return "Super administrador de plataforma"
  if (role === "platform_operator") return "Operador de plataforma"
  return "Auditor de plataforma"
}
