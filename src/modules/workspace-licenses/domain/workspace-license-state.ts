/**
 * Estado de licencias por asientos de un workspace (contrato de dominio).
 * Alineado a contracts-docs workspace-licenses: contratados efectivos, asignados,
 * disponibles = contratados − asignados (derivado, no persistido).
 */

export type PendingSeatReduction = {
  /** Valor de `seatsPurchased` tras aplicar la renovación del día 1. */
  targetPurchasedAfterRenewal: number
  /** Fecha del día 1 en que aplica (UTC); coincide con `nextRenewalDate` al programar. */
  appliesOn: Date
}

export type WorkspaceLicenseState = {
  workspacePublicId: string
  /** Capacidad contratada que rige “hoy” (efecto inmediato al comprar/aumentar). */
  seatsPurchased: number
  /** Asientos ocupados por membresías con licencia. Fuente de verdad hasta sincronizar con workspace-users. */
  seatsAssigned: number
  /** Reducción programada hacia el próximo día 1; null si no hay. */
  pendingSeatReduction: PendingSeatReduction | null
  /** Próximo evento de renovación mensual (día 1, UTC). */
  nextRenewalDate: Date
  /** Last renewal cycle applied at (audit / idempotency helper). */
  lastRenewalAt: Date | null
}

/**
 * `seatsAvailable` no se persiste; siempre se deriva de purchased − assigned (≥ 0 si está bien formado).
 */
export function computeSeatsAvailable(state: Pick<WorkspaceLicenseState, "seatsPurchased" | "seatsAssigned">): number {
  return state.seatsPurchased - state.seatsAssigned
}

export type WorkspaceLicenseSummary = {
  workspacePublicId: string
  seatsPurchased: number
  seatsAssigned: number
  seatsAvailable: number
  pendingSeatReduction: PendingSeatReduction | null
  nextRenewalDate: Date
  lastRenewalAt: Date | null
}

export function toSummary(state: WorkspaceLicenseState): WorkspaceLicenseSummary {
  return {
    workspacePublicId: state.workspacePublicId,
    seatsPurchased: state.seatsPurchased,
    seatsAssigned: state.seatsAssigned,
    seatsAvailable: computeSeatsAvailable(state),
    pendingSeatReduction: state.pendingSeatReduction,
    nextRenewalDate: state.nextRenewalDate,
    lastRenewalAt: state.lastRenewalAt,
  }
}
