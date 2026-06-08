import { z } from "zod"
import { managementApproachSchema } from "./project-draft.schemas.js"

export const workspaceProjectsPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
})

export const projectDraftPathParamsSchema = z.object({
  workspacePublicId: z.string().uuid(),
  draftPublicId: z.string().uuid(),
})

/** Cuerpo opcional al crear un borrador vacío. */
export const createProjectDraftBodySchema = z
  .object({
    projectName: z.string().min(1).max(500).optional(),
  })
  .strict()

const charterText = z.string().max(20_000)

/**
 * PATCH charter incremental: solo claves conocidas (module-overview), todas opcionales en un mismo request,
 * pero debe enviarse al menos una propiedad. `.strict()` rechaza claves desconocidas hasta ampliar contrato HTTP.
 */
export const patchCharterBodySchema = z
  .object({
    name: charterText.optional(),
    description: charterText.optional(),
    problemOrOpportunity: charterText.optional(),
    generalObjective: charterText.optional(),
    initialScope: charterText.optional(),
    expectedBenefits: charterText.optional(),
    mainStakeholders: charterText.optional(),
    targetDateOrTimeWindow: charterText.optional(),
    knownConstraints: charterText.optional(),
    successCriteria: charterText.optional(),
    initialRisks: charterText.optional(),
    mainResponsible: charterText.optional(),
    organizationalContext: charterText.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Enviar al menos un campo del charter para actualizar.",
  })

const assessmentPrimitive = z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
])

/**
 * PATCH evaluación metodológica incremental. Valores flexibles (texto, número, booleano, null) hasta cerrar controles del motor.
 */
export const patchAssessmentBodySchema = z
  .object({
    workNature: assessmentPrimitive.optional(),
    uncertaintyLevel: assessmentPrimitive.optional(),
    scopeStability: assessmentPrimitive.optional(),
    changeAcceptance: assessmentPrimitive.optional(),
    deliveryShape: assessmentPrimitive.optional(),
    interruptionFrequency: assessmentPrimitive.optional(),
    prioritizationType: assessmentPrimitive.optional(),
    teamComposition: assessmentPrimitive.optional(),
    teamDedication: assessmentPrimitive.optional(),
    autonomyLevel: assessmentPrimitive.optional(),
    businessFeedbackAvailability: assessmentPrimitive.optional(),
    crossAreaDependencies: assessmentPrimitive.optional(),
    controlTraceabilityComplianceNeed: assessmentPrimitive.optional(),
    dateCommitmentCriticality: assessmentPrimitive.optional(),
    teamMethodologicalMaturity: assessmentPrimitive.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: "Enviar al menos un campo de evaluación para actualizar.",
  })

/** POST sin payload o con objeto vacío estricto (rechaza claves extra). */
export const postEmptyStrictBodySchema = z.object({}).strict()

/** Decisión humana tras recomendación. Justificación solo aplica si hay sobrescritura (servicio la ignora si no). */
export const postDecisionBodySchema = z
  .object({
    selectedApproach: managementApproachSchema,
    overrideJustification: z.string().max(20_000).optional().nullable(),
  })
  .strict()
