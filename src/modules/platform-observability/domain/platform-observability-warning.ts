export const PLATFORM_OBSERVABILITY_WARNING_CODES = [
  "TENANT_SUSPENDED",
  "LICENSE_ROW_MISSING",
  "LICENSE_SEATS_OVER_ASSIGNED",
] as const

export type PlatformObservabilityWarningCode = (typeof PLATFORM_OBSERVABILITY_WARNING_CODES)[number]

export type PlatformObservabilityActiveWarning = {
  code: PlatformObservabilityWarningCode
  /** v1: `warning` afecta salud; `info` explica carencia de datos sin mezclar con billing. */
  severity: "warning" | "info"
  message: string
  relatedModules: ("platform_tenants" | "platform_licensing")[]
}
