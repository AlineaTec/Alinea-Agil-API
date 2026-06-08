import {
  ANNUAL_DISCOUNT_RATE_CAP,
  ANNUAL_DISCOUNT_RATE_DEFAULT,
} from "./commercial-pricing.constants.js"

/**
 * Tasa de descuento anual efectiva (0–`ANNUAL_DISCOUNT_RATE_CAP`). Default **10%** (contrato docs).
 * `COMMERCIAL_ANNUAL_DISCOUNT_RATE` opcional para otro valor dentro del rango permitido.
 */
export function getAnnualDiscountRate(): number {
  const raw = process.env.COMMERCIAL_ANNUAL_DISCOUNT_RATE?.trim()
  if (!raw) return ANNUAL_DISCOUNT_RATE_DEFAULT
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return ANNUAL_DISCOUNT_RATE_DEFAULT
  if (n > ANNUAL_DISCOUNT_RATE_CAP) return ANNUAL_DISCOUNT_RATE_CAP
  return n
}
