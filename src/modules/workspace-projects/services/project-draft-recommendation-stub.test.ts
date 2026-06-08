import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { MethodologyAssessment } from "../domain/project-draft-assessment.js"
import type { ProjectDraftCharter } from "../domain/project-draft-charter.js"
import { buildRecommendationFromAssessment } from "./project-draft-recommendation-stub.js"

function assess(partial: MethodologyAssessment): MethodologyAssessment {
  return {
    teamMethodologicalMaturity: 4,
    controlTraceabilityComplianceNeed: 2,
    ...partial,
  }
}

describe("buildRecommendationFromAssessment (stub-0.2)", () => {
  it("mejoras continuas + alta incertidumbre + prioridad cambiante → Kanban", () => {
    const r = buildRecommendationFromAssessment(
      assess({
        workNature: "research_improvement",
        uncertaintyLevel: 5,
        scopeStability: 2,
        changeAcceptance: 5,
        deliveryShape: "incremental_iterative",
        interruptionFrequency: 5,
        prioritizationType: "urgency_deadline",
      }),
    )
    assert.equal(r.suggestedApproach, "kanban")
    assert.match(r.explanation, /mejora|flujo|reactividad|operativo/i)
    assert.match(r.explanation, /Kanban/i)
  })

  it("corrección de errores + trabajo reactivo (charter) → Kanban aunque el producto parezca entrega", () => {
    const charter: ProjectDraftCharter = {
      name: "Mantenimiento aplicación",
      description: "Corrección de errores y tickets de incidencias en producción.",
    }
    const r = buildRecommendationFromAssessment(
      assess({
        workNature: "product_delivery",
        uncertaintyLevel: 4,
        scopeStability: 2,
        changeAcceptance: 4,
        deliveryShape: "continuous_flow",
        interruptionFrequency: 4,
        prioritizationType: "urgency_deadline",
      }),
      charter,
    )
    assert.equal(r.suggestedApproach, "kanban")
    assert.match(r.explanation, /correctivo|incidencias|reactividad|flujo/i)
  })

  it("desarrollo incremental + iteraciones viables + objetivo por período → Scrum", () => {
    const r = buildRecommendationFromAssessment(
      assess({
        workNature: "product_delivery",
        uncertaintyLevel: 4,
        scopeStability: 4,
        changeAcceptance: 2,
        deliveryShape: "incremental_iterative",
        interruptionFrequency: 2,
        prioritizationType: "business_value",
      }),
    )
    assert.equal(r.suggestedApproach, "scrum")
    assert.match(r.explanation, /Factores dominantes/i)
    assert.match(r.explanation, /Scrum|iteraci/i)
  })

  it("perfil mixto → resultado razonado con factores", () => {
    const r = buildRecommendationFromAssessment(
      assess({
        workNature: "mixed",
        uncertaintyLevel: 3,
        scopeStability: 3,
        changeAcceptance: 3,
        deliveryShape: "mixed",
        interruptionFrequency: 3,
        prioritizationType: "balanced",
      }),
    )
    assert.ok(["kanban", "scrum"].includes(r.suggestedApproach))
    assert.ok(r.explanation.length > 80)
    assert.match(r.explanation, /mixto|equilibrad|dominantes/i)
  })

  it("la explicación no reduce el resultado a solo incertidumbre numérica", () => {
    const r = buildRecommendationFromAssessment(
      assess({
        workNature: "operations_continuous",
        uncertaintyLevel: 5,
        scopeStability: 2,
        changeAcceptance: 3,
        deliveryShape: "continuous_flow",
        interruptionFrequency: 4,
        prioritizationType: "urgency_deadline",
      }),
    )
    assert.equal(r.suggestedApproach, "kanban")
    assert.ok(!/^[^.]*alta incertidumbre[^.]*\.$/i.test(r.explanation.trim()))
    assert.match(r.explanation, /operaci[oó]n|continu|flujo|reactividad/i)
  })
})
