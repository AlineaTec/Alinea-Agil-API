import { normalizeEmailBasic } from "../../validation/email-normalization.js"

/**
 * Consulta si un correo ya pertenece a una cuenta existente (Fase A, REG-EMAIL-03).
 *
 * **Producción:** implementación real debe delegar en el módulo de usuarios/cuentas
 * (repositorio persistido, no listas en env). La implementación por defecto aquí es **solo desarrollo**.
 */
export interface AccountLookupPort {
  isEmailRegistered(normalizedEmail: string): Promise<boolean>
}

/**
 * Implementación **provisional**: trata como «ya registrados» los correos listados en
 * `REGISTRATION_PROVISIONAL_REGISTERED_EMAILS` (separados por coma), normalizados igual que el flujo.
 *
 * Si la variable está vacía, **ningún** correo se considera registrado (until User module exists).
 */
export class ProvisionalEnvAccountLookup implements AccountLookupPort {
  private readonly registered: Set<string>

  constructor() {
    const raw = process.env.REGISTRATION_PROVISIONAL_REGISTERED_EMAILS ?? ""
    this.registered = new Set(
      raw
        .split(",")
        .map((s) => normalizeEmailBasic(s))
        .filter((s) => s.length > 0),
    )
  }

  async isEmailRegistered(normalizedEmail: string): Promise<boolean> {
    return this.registered.has(normalizedEmail)
  }
}
