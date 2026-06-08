import type { WorkControlSeverityLevel } from "../../domain/work-ready-done-controls.constants.js"

export interface WorkControlsProjectProfileDocProps {
  workspacePublicId: string
  projectPublicId: string
  approach: "scrum" | "kanban"
  version: number
  definitionSource: "system_default" | "workspace_template" | "project"
  criteria: Array<{
    ruleId: string
    isEnabled: boolean
    level: WorkControlSeverityLevel
  }>
  kanbanColumnMapping: {
    startExecutionColumnPublicId: string | null
    doneCloseItemColumnPublicId: string | null
  }
  createdAt: Date
  updatedAt: Date
}
