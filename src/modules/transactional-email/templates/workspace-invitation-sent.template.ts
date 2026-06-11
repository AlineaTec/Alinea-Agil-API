import { BRAND_PRODUCT_LINE, textFooter, wrapTransactionalHtml } from "./layout.js"
import {
  ctaButtonHtml,
  escapeHtml,
  highlightBoxHtml,
  mutedNoteHtml,
  orderedStepsHtml,
  paragraphHtml,
  sectionHeadingHtml,
} from "./email-ui-blocks.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

export function renderWorkspaceInvitationSent(params: {
  displayName: string | null
  invitedEmail: string
  workspaceDisplayName: string
  workspaceCode: string | null
  roleLabel: string
  acceptUrl: string
  invitedByDisplayName?: string | null
}): RenderedTransactionalEmail {
  const name = params.displayName?.trim() || params.invitedEmail
  const codeLine =
    params.workspaceCode != null && params.workspaceCode.trim().length > 0
      ? ` · código <strong>${escapeHtml(params.workspaceCode.trim())}</strong>`
      : ""
  const inviter = params.invitedByDisplayName?.trim()
  const inviterLine = inviter
    ? paragraphHtml(
        `<strong>${escapeHtml(inviter)}</strong> te invitó a unirte a un workspace existente en <strong>${BRAND_PRODUCT_LINE}</strong>.`,
      )
    : paragraphHtml(
        `Te invitaron a colaborar en un workspace de <strong>${BRAND_PRODUCT_LINE}</strong>.`,
      )

  const inviteSummary = highlightBoxHtml(
    `<strong style="color:#18181b;">${escapeHtml(params.workspaceDisplayName)}</strong>${codeLine}<br />
<span style="font-size:13px;color:#737373;">Rol propuesto: <strong>${escapeHtml(params.roleLabel)}</strong></span>`,
  )

  const steps = [
    "Abrí el enlace de abajo y revisá los datos de la invitación.",
    "Si ya tenés cuenta con este correo, iniciá sesión; si no, completá el registro con la misma dirección de email.",
    "Al aceptar, quedarás vinculado al workspace con el rol indicado (sin crear un workspace nuevo).",
    "Explorá el hub del proyecto y el ciclo actual; el botón de Ayuda (?) en la app explica cada pantalla.",
  ] as const

  const body = [
    paragraphHtml(`Hola ${escapeHtml(name)},`),
    inviterLine,
    paragraphHtml(
      `${BRAND_PRODUCT_LINE} ayuda a equipos y organizaciones a operar Scrum y Kanban con estructura, trazabilidad y una lectura compartida del avance.`,
    ),
    inviteSummary,
    ctaButtonHtml(params.acceptUrl, "Revisar y aceptar invitación"),
    sectionHeadingHtml("Qué hacer a continuación"),
    orderedStepsHtml(steps),
    mutedNoteHtml(
      "Este enlace caduca en <strong>7 días</strong>. No es un registro comercial de workspace nuevo: solo suma tu cuenta a un espacio ya existente. No enviamos contraseñas por correo. Si no esperabas esta invitación, podés ignorar el mensaje.",
    ),
  ].join("")

  const text = [
    `Hola ${name},`,
    ``,
    inviter
      ? `${inviter} te invitó al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE}.`
      : `Te invitaron al workspace "${params.workspaceDisplayName}" en ${BRAND_PRODUCT_LINE}.`,
    `Rol propuesto: ${params.roleLabel}.`,
    ``,
    "Aceptar invitación:",
    params.acceptUrl,
    ``,
    "Pasos:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    "El enlace caduca en 7 días. No es registro de workspace nuevo.",
    textFooter(),
  ].join("\n")

  return {
    subject: inviter
      ? `${inviter} te invita a ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`
      : `Invitación a workspace — ${params.workspaceDisplayName} · ${BRAND_PRODUCT_LINE}`,
    html: wrapTransactionalHtml(body),
    text,
  }
}
