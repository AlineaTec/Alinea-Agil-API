/**
 * Respuesta POST /email-eligibility — forma estable para enlazar con `web` (sin OpenAPI final aún).
 */
export type EmailEligibilityResponse =
  | { eligible: true; intentPublicId: string }
  | { eligible: false; reason: "email_already_registered" }
