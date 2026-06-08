import type {
  WorkControlCriterionConfig,
  WorkControlsProjectProfileState,
  WorkControlsTemplateState,
} from "../domain/work-ready-done-controls.dto.js"
import type { WorkControlsProjectProfileDocProps } from "./schemas/work-controls-project-profile.schema.js"
import type { WorkControlsTemplateDocProps } from "./schemas/work-controls-workspace-template.schema.js"
import type { WorkControlOverrideTokenDocProps } from "./schemas/work-control-override-token.schema.js"

export type WorkControlOverrideTokenState = {
  overrideTokenPublicId: string
  workspacePublicId: string
  projectPublicId: string
  workItemPublicId: string
  eventCode: string
  actorUserPublicId: string
  reason: string
  createdAt: Date
  expiresAt: Date
  consumedAt: Date | null
}

export function docToProfile(doc: WorkControlsProjectProfileDocProps): WorkControlsProjectProfileState {
  return {
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    approach: doc.approach,
    version: doc.version,
    definitionSource: doc.definitionSource,
    criteria: doc.criteria.map((c) => ({
      ruleId: c.ruleId as WorkControlCriterionConfig["ruleId"],
      isEnabled: c.isEnabled,
      level: c.level,
    })),
    kanbanColumnMapping: {
      startExecutionColumnPublicId: doc.kanbanColumnMapping.startExecutionColumnPublicId,
      doneCloseItemColumnPublicId: doc.kanbanColumnMapping.doneCloseItemColumnPublicId,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function profileToDoc(state: WorkControlsProjectProfileState): WorkControlsProjectProfileDocProps {
  return {
    workspacePublicId: state.workspacePublicId,
    projectPublicId: state.projectPublicId,
    approach: state.approach,
    version: state.version,
    definitionSource: state.definitionSource,
    criteria: state.criteria.map((c) => ({
      ruleId: c.ruleId,
      isEnabled: c.isEnabled,
      level: c.level,
    })),
    kanbanColumnMapping: {
      startExecutionColumnPublicId: state.kanbanColumnMapping.startExecutionColumnPublicId,
      doneCloseItemColumnPublicId: state.kanbanColumnMapping.doneCloseItemColumnPublicId,
    },
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

export function docToTemplate(doc: WorkControlsTemplateDocProps): WorkControlsTemplateState {
  return {
    workspacePublicId: doc.workspacePublicId,
    version: doc.version,
    criteria: doc.criteria.map((c) => ({
      ruleId: c.ruleId as WorkControlCriterionConfig["ruleId"],
      isEnabled: c.isEnabled,
      level: c.level,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function templateToDoc(state: WorkControlsTemplateState): WorkControlsTemplateDocProps {
  return {
    workspacePublicId: state.workspacePublicId,
    version: state.version,
    criteria: state.criteria.map((c) => ({
      ruleId: c.ruleId,
      isEnabled: c.isEnabled,
      level: c.level,
    })),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  }
}

export function docToOverrideToken(doc: WorkControlOverrideTokenDocProps): WorkControlOverrideTokenState {
  return {
    overrideTokenPublicId: doc.overrideTokenPublicId,
    workspacePublicId: doc.workspacePublicId,
    projectPublicId: doc.projectPublicId,
    workItemPublicId: doc.workItemPublicId,
    eventCode: doc.eventCode,
    actorUserPublicId: doc.actorUserPublicId,
    reason: doc.reason,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    consumedAt: doc.consumedAt,
  }
}

export function overrideTokenToDoc(state: WorkControlOverrideTokenState): WorkControlOverrideTokenDocProps {
  return {
    overrideTokenPublicId: state.overrideTokenPublicId,
    workspacePublicId: state.workspacePublicId,
    projectPublicId: state.projectPublicId,
    workItemPublicId: state.workItemPublicId,
    eventCode: state.eventCode,
    actorUserPublicId: state.actorUserPublicId,
    reason: state.reason,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
    consumedAt: state.consumedAt,
  }
}
