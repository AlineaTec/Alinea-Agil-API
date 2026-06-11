import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderPlatformUserInvited } from "./platform-user-invited.template.js"
import { renderPlatformMfaLockoutNotice } from "./platform-mfa-lockout.template.js"
import { renderPlatformUserSecurityNotice } from "./platform-user-security-notice.template.js"
import { renderRegistrationPaymentConfirmation } from "./registration-payment-confirmation.template.js"
import { summarizeClientForEmail } from "../util/user-agent-summary.js"
import { renderPlatformAdminSessionStarted } from "./platform-admin-session-started.template.js"
import { renderRegistrationVerificationOtp } from "./registration-verification-otp.template.js"
import { renderWorkspaceMemberAdded } from "./workspace-member-added.template.js"
import { renderRegistrationWelcome } from "./registration-welcome.template.js"
import { renderWorkspaceInvitationSent } from "./workspace-invitation-sent.template.js"

describe("transactional email templates", () => {
  it("miembro workspace añadido — enlaces login y registro", () => {
    const withAccount = renderWorkspaceMemberAdded({
      displayName: "Ana",
      invitedEmail: "ana@test.local",
      workspaceDisplayName: "Acme",
      workspaceCode: "acme",
      roleLabel: "Administrador",
      loginUrl: "https://app.example.com/login",
      registerUrl: "https://app.example.com/registro",
      hasRegisteredAccount: true,
    })
    assert.match(withAccount.subject, /Acme/)
    assert.match(withAccount.text, /https:\/\/app\.example\.com\/login/)
    assert.match(withAccount.html, /Iniciar sesión/)

    const newUser = renderWorkspaceMemberAdded({
      displayName: "Bob",
      invitedEmail: "bob@test.local",
      workspaceDisplayName: "Acme",
      workspaceCode: null,
      roleLabel: "Scrum Master",
      loginUrl: "https://app.example.com/login",
      registerUrl: "https://app.example.com/registro",
      hasRegisteredAccount: false,
    })
    assert.match(newUser.text, /registro/)
    assert.match(newUser.html, /Crear mi cuenta/)
  })

  it("registration OTP incluye código en texto y HTML", () => {
    const r = renderRegistrationVerificationOtp({ code: "123456" })
    assert.match(r.html, /123456/)
    assert.match(r.text, /123456/)
    assert.match(r.subject, /verificación/i)
  })

  it("invitación plataforma escapa HTML en nonce", () => {
    const r = renderPlatformUserInvited({
      displayName: null,
      roleLabel: "Operador",
      invitationNonce: "<script>x</script>",
      invitedEmail: "a@b.co",
    })
    assert.doesNotMatch(r.html, /<script>/i)
    assert.match(r.html, /&lt;script&gt;/)
  })

  it("aviso MFA lockout incluye marca temporal en texto", () => {
    const r = renderPlatformMfaLockoutNotice({ lockedUntilIso: "2026-01-15T12:00:00.000Z" })
    assert.match(r.subject, /Bloqueo temporal MFA/i)
    assert.match(r.text, /2026-01-15/)
  })

  it("aviso seguridad plataforma — cambio de rol menciona rol nuevo", () => {
    const r = renderPlatformUserSecurityNotice({
      kind: "role_changed",
      greetingName: "Ana",
      newRoleLabel: "Auditor de plataforma",
    })
    assert.match(r.subject, /Cambio de rol/i)
    assert.match(r.text, /Auditor de plataforma/)
    assert.match(r.html, /Auditor de plataforma/)
  })

  it("aviso seguridad plataforma — desactivación sin datos sensibles", () => {
    const r = renderPlatformUserSecurityNotice({
      kind: "deactivated",
      greetingName: "bob@test.local",
    })
    assert.match(r.subject, /desactivada/i)
    assert.match(r.text, /desactivada/i)
    assert.doesNotMatch(r.text, /password|contraseña|nonce/i)
  })

  it("nueva sesión admin incluye IP y resumen de cliente razonable", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0"
    const r = renderPlatformAdminSessionStarted({
      greetingName: "Ana",
      email: "ana@test.local",
      roleLabel: "Operador de plataforma",
      sessionPublicId: "11111111-1111-1111-1111-111111111111",
      sessionStartedAtIso: "2026-04-09T12:00:00.000Z",
      clientIp: "203.0.113.1",
      userAgentRaw: ua,
      clientSummary: summarizeClientForEmail(ua),
    })
    assert.match(r.subject, /Nueva sesión/i)
    assert.match(r.text, /203\.0\.113\.1/)
    assert.match(r.text, /Firefox/)
    assert.match(r.html, /ana@test\.local/)
  })

  it("bienvenida registro — CTA login y pasos de ayuda", () => {
    const r = renderRegistrationWelcome({
      accountFullName: "Ana López",
      loginUrl: "https://web.agil.alineatec.com/login",
      workspaceDisplayName: "Acme Delivery",
      workspaceCode: "acme",
      planTier: "gratis",
    })
    assert.match(r.subject, /Bienvenido/i)
    assert.match(r.html, /Iniciar sesión/)
    assert.match(r.text, /Ayuda/)
    assert.match(r.html, /acme/)
  })

  it("invitación workspace — menciona invitador y botón aceptar", () => {
    const r = renderWorkspaceInvitationSent({
      displayName: "Bob",
      invitedEmail: "bob@test.local",
      workspaceDisplayName: "Acme",
      workspaceCode: "acme",
      roleLabel: "Scrum Master",
      acceptUrl: "https://web.agil.alineatec.com/app/workspace/invitations/accept?token=abc",
      invitedByDisplayName: "María García",
    })
    assert.match(r.subject, /María García/)
    assert.match(r.html, /aceptar invitación/i)
    assert.match(r.text, /7 días/)
    assert.doesNotMatch(r.html, /<script>/i)
  })

  it("confirmación pago incluye referencia de intent", () => {
    const r = renderRegistrationPaymentConfirmation({
      intentPublicId: "550e8400-e29b-41d4-a716-446655440000",
      workspaceDisplayName: "Acme",
      workspaceCode: "acme",
      planLabel: "Individual",
      billingCadenceLabel: "Mensual",
    })
    assert.match(r.text, /550e8400-e29b-41d4-a716-446655440000/)
    assert.match(r.html, /Acme/)
  })
})
