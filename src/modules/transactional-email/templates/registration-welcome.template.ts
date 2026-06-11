import { BRAND_PRODUCT_LINE, BRAND_PRODUCT_PUBLIC_URL, textFooter, wrapTransactionalHtml } from "./layout.js"
import {
  ctaButtonHtml,
  escapeHtml,
  highlightBoxHtml,
  mutedNoteHtml,
  orderedStepsHtml,
  paragraphHtml,
  sectionHeadingHtml,
  textLinkHtml,
} from "./email-ui-blocks.js"
import type { RenderedTransactionalEmail } from "./rendered-email.js"

function planTierLabelEs(planTier: string | undefined): string {
  if (planTier === "gratis") return "Gratis"
  if (planTier === "estandar") return "Estándar"
  if (planTier === "profesional") return "Profesional"
  return "—"
}

export function renderRegistrationWelcome(params: {
  accountFullName: string
  loginUrl: string
  workspaceDisplayName: string
  workspaceCode: string | null
  planTier?: string
  productUrl?: string
}): RenderedTransactionalEmail {
  const greetingName = params.accountFullName.trim() || "equipo"
  const codeLine =
    params.workspaceCode != null && params.workspaceCode.trim().length > 0
      ? ` · código <strong>${escapeHtml(params.workspaceCode.trim())}</strong>`
      : ""
  const planLabel = planTierLabelEs(params.planTier)
  const productUrl = params.productUrl?.trim() || BRAND_PRODUCT_PUBLIC_URL

  const workspaceSummary = highlightBoxHtml(
    `<strong style="color:#18181b;">Tu workspace</strong><br />
<span style="font-size:14px;color:#52525b;">${escapeHtml(params.workspaceDisplayName)}${codeLine}</span><br />
<span style="font-size:13px;color:#737373;">Plan: ${escapeHtml(planLabel)}</span>`,
  )

  const steps = [
    "Inicia sesión con el correo y la contraseña que definiste en el registro.",
    "Desde el inicio del workspace, crea o materializa tu primer proyecto (Scrum o Kanban).",
    "Revisa el hub del proyecto, el ciclo actual, el backlog y el tablero para alinear el trabajo diario.",
    "Configura equipos de trabajo y roles si vas a colaborar con más personas.",
    "Usa el botón de Ayuda (?) en la barra lateral: encontrarás guías contextuales según la pantalla en la que estés.",
  ] as const

  const body = [
    paragraphHtml(`Hola <strong>${escapeHtml(greetingName)}</strong>,`),
    paragraphHtml(
      `Tu cuenta en <strong>${BRAND_PRODUCT_LINE}</strong> ya está activa. A partir de ahora podés alinear método y operación en un solo lugar: Scrum, Kanban, ceremonias guiadas, métricas y lectura compartida para el equipo y la dirección.`,
    ),
    workspaceSummary,
    ctaButtonHtml(params.loginUrl, "Iniciar sesión en Alinea Ágil"),
    sectionHeadingHtml("Primeros pasos recomendados"),
    orderedStepsHtml(steps),
    sectionHeadingHtml("Ayuda y recursos"),
    paragraphHtml(
      `Dentro de la aplicación, el panel de <strong>Ayuda contextual</strong> responde dudas sobre la pantalla actual (proyectos, ceremonias, reportes, administración). También podés explorar la oferta pública en ${textLinkHtml(productUrl, "agil.alineatec.com")}.`,
    ),
    mutedNoteHtml(
      "Por seguridad, no enviamos contraseñas ni enlaces de restablecimiento en este mensaje. Si no creaste esta cuenta, contactá a soporte de AlineaTec.",
    ),
  ].join("")

  const text = [
    `Hola ${greetingName},`,
    ``,
    `Bienvenido a ${BRAND_PRODUCT_LINE}. Tu workspace "${params.workspaceDisplayName}" ya está listo (plan: ${planLabel}).`,
    ``,
    "Iniciar sesión:",
    params.loginUrl,
    ``,
    "Primeros pasos:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    ``,
    "Ayuda: usa el botón de Ayuda (?) en la barra lateral de la aplicación.",
    `Más información: ${productUrl}`,
    ``,
    "No enviamos contraseñas por correo.",
    textFooter(),
  ].join("\n")

  return {
    subject: `Bienvenido a ${BRAND_PRODUCT_LINE} — tu workspace ya está listo`,
    html: wrapTransactionalHtml(body),
    text,
  }
}
