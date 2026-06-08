import type { WorkControlSeverityLevel } from "../../domain/work-ready-done-controls.constants.js"

export interface WorkControlsTemplateDocProps {
  workspacePublicId: string
  version: number
  criteria: Array<{
    ruleId: string
    isEnabled: boolean
    level: WorkControlSeverityLevel
  }>
  createdAt: Date
  updatedAt: Date
}
