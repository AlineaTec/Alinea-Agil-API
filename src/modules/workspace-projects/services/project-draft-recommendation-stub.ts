import type { ManagementApproach } from "../domain/management-approach.js"
import type { ProjectDraftCharter } from "../domain/project-draft-charter.js"
import type { MethodologyAssessment } from "../domain/project-draft-assessment.js"
import type { ProjectDraftState } from "../domain/project-draft.js"
import type { RecommendationResult } from "../domain/project-draft-recommendation.js"

/** Versión trazable del motor sustituto hasta reglas/ML reales. */
export const RECOMMENDATION_STUB_ENGINE_VERSION = "stub-0.2.0"

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = Number.parseFloat(v.trim())
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return null
}

function matches(v: unknown, pattern: RegExp): boolean {
  return typeof v === "string" && pattern.test(v.trim())
}

function strField(a: MethodologyAssessment, key: keyof MethodologyAssessment): string | null {
  const v = a[key]
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

/** Texto libre del charter: señal débil para correctivo/mejora sin nuevo campo en formulario. */
const CHARTER_REACTIVE_WORK = new RegExp(
  [
    "correcci[oó]n",
    "correctivo",
    "\\bbug\\b",
    "incidencia",
    "\\berror(es)?\\b",
    "hotfix",
    "mejora\\s+continu",
    "mantenimient",
    "soporte\\s+",
    "\\bsla\\b",
    "ticket",
    "help\\s*desk",
    "falla",
    "defecto",
  ].join("|"),
  "i",
)

function charterSuggestsReactiveMaintenance(charter: ProjectDraftCharter | undefined): boolean {
  if (!charter || typeof charter !== "object") return false
  const parts: string[] = []
  for (const k of [
    "name",
    "description",
    "problemOrOpportunity",
    "initialScope",
    "generalObjective",
    "expectedBenefits",
  ] as const) {
    const v = charter[k]
    if (typeof v === "string" && v.trim()) parts.push(v.trim())
  }
  return CHARTER_REACTIVE_WORK.test(parts.join("\n"))
}

function discoveryLearningContext(wn: string | null, delivery: string | null): boolean {
  if (wn === "product_delivery") return true
  if (delivery === "incremental_iterative") return true
  return false
}

/**
 * Incertidumbre “de descubrimiento” (favorece iteraciones) vs operativa / flujo cambiante (favorece Kanban).
 */
function interpretUncertaintyRole(
  unc: number | null,
  wn: string | null,
  delivery: string | null,
  strongFlowNature: boolean,
  highlyReactive: boolean,
): "discovery_for_scrum" | "operational_for_kanban" | "neutral" {
  if (unc === null || unc < 4) return "neutral"
  if (strongFlowNature || highlyReactive) return "operational_for_kanban"
  if (discoveryLearningContext(wn, delivery)) return "discovery_for_scrum"
  return "operational_for_kanban"
}

function canTimeboxIterations(
  delivery: string | null,
  interrupt: number | null,
  prio: string | null,
  scope: number | null,
): boolean {
  if (delivery !== "incremental_iterative" && delivery !== "milestone_batches") return false
  if (prio === "urgency_deadline") return false
  if (interrupt !== null && interrupt > 2) return false
  if (scope !== null && scope < 3) return false
  return true
}

function isHighlyReactive(
  interrupt: number | null,
  prio: string | null,
  delivery: string | null,
  change: number | null,
  scope: number | null,
): boolean {
  if (interrupt !== null && interrupt >= 4) return true
  if (prio === "urgency_deadline") return true
  if (delivery === "continuous_flow") return true
  if (change !== null && change >= 4 && scope !== null && scope <= 3) return true
  if (matches(delivery, /continu|flujo|flow|kanban/i)) return true
  return false
}

function isStrongFlowOfWorkNature(wn: string | null, maintCharter: boolean): boolean {
  if (wn === "research_improvement" || wn === "operations_continuous") return true
  if (maintCharter) return true
  return false
}

function isSoftImprovementNature(wn: string | null): boolean {
  return wn === "internal_change"
}

/**
 * Motor en dos capas (sesgo base + ajustes operativos), sin ML.
 * Exportado para tests; el agregado usa `buildStubRecommendationResult`.
 */
export function buildRecommendationFromAssessment(
  methodologyAssessment: MethodologyAssessment,
  charter: ProjectDraftCharter = {},
): RecommendationResult {
  const a = methodologyAssessment
  const unc = toNumber(a.uncertaintyLevel)
  const scope = toNumber(a.scopeStability)
  const maturity = toNumber(a.teamMethodologicalMaturity)
  const compliance = toNumber(a.controlTraceabilityComplianceNeed)
  const change = toNumber(a.changeAcceptance)
  const interrupt = toNumber(a.interruptionFrequency)

  const wn = strField(a, "workNature")
  const delivery = strField(a, "deliveryShape")
  const prio = strField(a, "prioritizationType")
  const maintCharter = charterSuggestsReactiveMaintenance(charter)

  const highlyReactive = isHighlyReactive(interrupt, prio, delivery, change, scope)
  const timeboxViable = canTimeboxIterations(delivery, interrupt, prio, scope)
  const strongFlowNature = isStrongFlowOfWorkNature(wn, maintCharter)
  const softImprovement = isSoftImprovementNature(wn)

  const uncertaintyRole = interpretUncertaintyRole(unc, wn, delivery, strongFlowNature, highlyReactive)

  let suggestedApproach: ManagementApproach = "kanban"
  const narrative: string[] = []

  if (maturity !== null && maturity <= 1) {
    suggestedApproach = "not_ready_to_start"
    narrative.push(
      "La madurez metodológica registrada es muy baja o sin señal clara; conviene fortalecer bases antes de elegir un marco operativo.",
    )
    return finalizeResult(suggestedApproach, narrative, {
      unc,
      scope,
      maturity,
      compliance,
      wn,
      delivery,
      prio,
      interrupt,
      change,
      maintCharter,
      highlyReactive,
      timeboxViable,
      uncertaintyRole,
      forcedRule: "not_ready",
    })
  }

  if (
    compliance !== null &&
    compliance >= 4 &&
    scope !== null &&
    scope >= 4 &&
    (unc === null || unc <= 2)
  ) {
    suggestedApproach = "predictive_phases"
    narrative.push(
      "Predomina un alcance estable con alta necesidad de control y trazabilidad; un enfoque por fases planificadas encaja mejor que iteraciones cortas o flujo puro.",
    )
    return finalizeResult(suggestedApproach, narrative, {
      unc,
      scope,
      maturity,
      compliance,
      wn,
      delivery,
      prio,
      interrupt,
      change,
      maintCharter,
      highlyReactive,
      timeboxViable,
      uncertaintyRole,
      forcedRule: "predictive",
    })
  }

  /** Regla fuerte: mejora continua / operación / charter reactivo + demanda cambiante → Kanban salvo timebox realmente viable y poco reactivo. */
  const strongKanbanGate =
    strongFlowNature &&
    (highlyReactive || (unc !== null && unc >= 4) || (softImprovement && highlyReactive && (unc !== null && unc >= 3))) &&
    !timeboxViable

  const softKanbanGate =
    softImprovement &&
    !strongFlowNature &&
    maintCharter &&
    highlyReactive &&
    (unc !== null && unc >= 3) &&
    !timeboxViable

  if (strongKanbanGate || softKanbanGate) {
    suggestedApproach = "kanban"
    if (strongFlowNature) {
      narrative.push(
        "La naturaleza del trabajo se alinea con mejora, operación continua o flujo reactivo; conviene limitar trabajo en curso y priorizar el flujo más que una cadencia fija.",
      )
    } else {
      narrative.push(
        "El contexto del charter sugiere corrección, incidencias o mejora continua con demanda cambiante; Kanban gestiona mejor ese tipo de llegada de trabajo.",
      )
    }
    if (highlyReactive) {
      narrative.push(
        "Hay señales de reactividad (interrupciones, urgencias o entrega continua), poco compatibles con compromisos rígidos por iteración.",
      )
    } else if (unc !== null && unc >= 4) {
      narrative.push(
        "La incertidumbre parece más propia de un entorno operativo cambiante que de descubrimiento encapsulable en timeboxes; el flujo explícito suele funcionar mejor.",
      )
    }
    return finalizeResult(suggestedApproach, narrative, {
      unc,
      scope,
      maturity,
      compliance,
      wn,
      delivery,
      prio,
      interrupt,
      change,
      maintCharter,
      highlyReactive,
      timeboxViable,
      uncertaintyRole,
      forcedRule: strongKanbanGate ? "strong_flow_reactive" : "charter_reactive_internal",
    })
  }

  let k = 0
  let s = 0
  const scoreNotes: string[] = []

  if (wn === "research_improvement" || wn === "operations_continuous") {
    k += 5
    scoreNotes.push("naturaleza del trabajo orientada a mejora u operación continua")
  } else if (wn === "internal_change") {
    k += 2
    scoreNotes.push("cambio interno (sesgo leve a flujo)")
  } else if (wn === "product_delivery") {
    s += 3
    scoreNotes.push("entrega de producto o funcionalidad (compatible con iteraciones)")
  } else if (wn === "mixed") {
    k += 1
    s += 1
    scoreNotes.push("perfil mixto de trabajo")
  }

  if (maintCharter) {
    k += 3
    scoreNotes.push("texto del charter sugiere correctivo, incidencias o mejora continua")
  }

  if (delivery === "continuous_flow" || matches(delivery, /continu|flujo|flow|kanban/i)) {
    k += 4
    scoreNotes.push("forma de entrega continua o por flujo")
  } else if (delivery === "incremental_iterative" || delivery === "milestone_batches") {
    s += 2
    scoreNotes.push("entrega incremental o por hitos (compatible con timeboxing)")
  }

  if (highlyReactive) {
    k += 4
    scoreNotes.push("priorización reactiva, interrupciones altas o alcance volátil")
  }

  if (timeboxViable) {
    s += 4
    scoreNotes.push("el trabajo parece agrupable en iteraciones con priorización no solo urgente")
  }

  if (uncertaintyRole === "discovery_for_scrum" && unc !== null && unc >= 4) {
    s += 3
    scoreNotes.push(
      "incertidumbre alta en contexto de producto o incremento, coherente con descubrimiento por iteraciones",
    )
  } else if (uncertaintyRole === "operational_for_kanban" && unc !== null && unc >= 4) {
    k += 3
    scoreNotes.push("incertidumbre alta en contexto operativo o de flujo cambiante")
  } else if (unc !== null && unc === 3) {
    if (discoveryLearningContext(wn, delivery) && !highlyReactive) {
      s += 1
      scoreNotes.push("incertidumbre media con perfil de descubrimiento")
    } else if (highlyReactive) {
      k += 1
      scoreNotes.push("incertidumbre media con reactividad")
    }
  }

  if (prio === "business_value" || prio === "balanced" || prio === "stakeholder_agreement") {
    s += 1
  } else if (prio === "risk_effort") {
    k += 0
    s += 1
  }

  if (k > s) {
    suggestedApproach = "kanban"
    narrative.push(
      `Factores dominantes: ${scoreNotes.slice(0, 4).join("; ")}. En conjunto encaja mejor gestionar el trabajo como flujo con límites explícitos (Kanban).`,
    )
  } else if (s > k) {
    suggestedApproach = "scrum"
    narrative.push(
      `Factores dominantes: ${scoreNotes.slice(0, 4).join("; ")}. En conjunto encaja mejor una cadencia iterativa con objetivo de período (Scrum).`,
    )
  } else {
    suggestedApproach = "kanban"
    narrative.push(
      `Señales equilibradas (${scoreNotes.join("; ") || "sin notas"}). Por defecto se sugiere Kanban ante perfil mixto, por ser más tolerante a cambios de prioridad continuos.`,
    )
  }

  return finalizeResult(suggestedApproach, narrative, {
    unc,
    scope,
    maturity,
    compliance,
    wn,
    delivery,
    prio,
    interrupt,
    change,
    maintCharter,
    highlyReactive,
    timeboxViable,
    uncertaintyRole,
    scoreKanban: k,
    scoreScrum: s,
    forcedRule: "scored",
  })
}

type MotorSnapshot = {
  unc: number | null
  scope: number | null
  maturity: number | null
  compliance: number | null
  wn: string | null
  delivery: string | null
  prio: string | null
  interrupt: number | null
  change: number | null
  maintCharter: boolean
  highlyReactive: boolean
  timeboxViable: boolean
  uncertaintyRole: string
  forcedRule: string
  scoreKanban?: number
  scoreScrum?: number
}

function finalizeResult(
  suggestedApproach: ManagementApproach,
  narrative: string[],
  snap: MotorSnapshot,
): RecommendationResult {
  const lead =
    suggestedApproach === "not_ready_to_start"
      ? "No se recomienda iniciar aún con un marco completo."
      : suggestedApproach === "predictive_phases"
        ? "Se recomienda un enfoque predictivo por fases."
        : suggestedApproach === "scrum"
          ? "Se recomienda Scrum como marco principal."
          : "Se recomienda Kanban como marco principal."

  const explanation = [lead, ...narrative].join(" ")

  const determinants: Record<string, unknown> = {
    uncertaintyLevel: snap.unc,
    scopeStability: snap.scope,
    teamMethodologicalMaturity: snap.maturity,
    controlTraceabilityComplianceNeed: snap.compliance,
    workNature: snap.wn,
    deliveryShape: snap.delivery,
    prioritizationType: snap.prio,
    interruptionFrequency: snap.interrupt,
    changeAcceptance: snap.change,
    charterSuggestsReactiveWork: snap.maintCharter,
    highlyReactiveProfile: snap.highlyReactive,
    iterationTimeboxViable: snap.timeboxViable,
    uncertaintyInterpretation: snap.uncertaintyRole,
    recommendationRule: snap.forcedRule,
  }
  if (snap.scoreKanban !== undefined) determinants.scoreKanban = snap.scoreKanban
  if (snap.scoreScrum !== undefined) determinants.scoreScrum = snap.scoreScrum

  return {
    suggestedApproach,
    explanation: explanation.replace(/\s+/g, " ").trim(),
    determinants,
    engineVersion: RECOMMENDATION_STUB_ENGINE_VERSION,
    computedAt: new Date(),
  }
}

export function buildStubRecommendationResult(draft: ProjectDraftState): RecommendationResult {
  return buildRecommendationFromAssessment(draft.methodologyAssessment, draft.charter)
}
