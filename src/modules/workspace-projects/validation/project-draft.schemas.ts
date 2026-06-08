import { z } from "zod"
import { MANAGEMENT_APPROACHES } from "../domain/management-approach.js"
import { PROJECT_DRAFT_STATUSES } from "../domain/project-draft-status.js"

/** Para capa HTTP futura; validación de cuerpos y query. */
export const managementApproachSchema = z.enum(MANAGEMENT_APPROACHES)

export const projectDraftStatusSchema = z.enum(PROJECT_DRAFT_STATUSES)
