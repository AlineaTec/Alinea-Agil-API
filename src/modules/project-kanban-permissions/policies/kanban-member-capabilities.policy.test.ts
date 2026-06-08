import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { minimalWorkspaceMember } from "../../../test/scrum-policy-test-actors.js"
import { KanbanBoardForbiddenError } from "../../project-kanban-board/domain/kanban-board.errors.js"
import {
  assertCanBlockKanbanBoardItems,
  assertCanMoveKanbanBoardItem,
  assertCanReadKanbanBoard,
  assertCanReturnKanbanBoardItemsToBacklog,
} from "../../project-kanban-board/policies/kanban-board-authorization.policy.js"
import { KanbanBacklogForbiddenError } from "../../project-kanban-backlog/domain/kanban-backlog.errors.js"
import {
  assertCanMutateKanbanBacklogContent,
  assertCanRankKanbanBacklog,
  assertCanReadKanbanBacklog,
  assertCanReleaseToFlow,
} from "../../project-kanban-backlog/policies/kanban-backlog-authorization.policy.js"
import { KanbanMetricsForbiddenError } from "../../project-kanban-metrics/domain/kanban-metrics.errors.js"
import { assertCanReadKanbanMetrics } from "../../project-kanban-metrics/policies/kanban-metrics-authorization.policy.js"
import { KANBAN_CAPABILITY } from "../domain/kanban-capability.js"
import {
  ProjectKanbanFlowConfigureForbiddenError,
  KanbanReportsForbiddenError,
} from "../domain/kanban-permissions.errors.js"
import { assertCanConfigureKanbanFlow } from "./kanban-flow-configure.policy.js"
import { kanbanMemberHasCapability, kanbanMemberHasFlowConfigure } from "./kanban-member-capabilities.policy.js"
import { assertCanReadKanbanReports } from "./kanban-reports-read.policy.js"

const dev = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_developer" })
const sm = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_master" })
const coach = minimalWorkspaceMember({ workspaceRoleMethodological: "scrum_coach" })
const auditor = minimalWorkspaceMember({ workspaceRoleAdministrative: "auditor" })
const admin = minimalWorkspaceMember({ workspaceRoleAdministrative: "admin" })
const operator = minimalWorkspaceMember({ workspaceRoleAdministrative: "operator" })
const po = minimalWorkspaceMember({ workspaceRoleMethodological: "product_owner" })
const none = minimalWorkspaceMember({})

describe("kanban-member-capabilities.policy (matriz v1)", () => {
  it("coach no edita backlog; developer sí (kanban.backlog.edit)", () => {
    assert.throws(() => assertCanMutateKanbanBacklogContent(coach), KanbanBacklogForbiddenError)
    assert.doesNotThrow(() => assertCanMutateKanbanBacklogContent(dev))
  })

  it("lector/observador: coach y auditor leen backlog, board, metrics y reports", () => {
    assert.equal(kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.BACKLOG_READ), true)
    assert.equal(kanbanMemberHasCapability(auditor, KANBAN_CAPABILITY.BACKLOG_READ), true)
    assert.equal(kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.BOARD_READ), true)
    assert.equal(kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.METRICS_READ), true)
    assert.equal(kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.REPORTS_READ), true)
    assert.doesNotThrow(() => assertCanReadKanbanBacklog(coach))
    assert.doesNotThrow(() => assertCanReadKanbanBoard(coach))
    assert.doesNotThrow(() => assertCanReadKanbanMetrics(coach))
    assert.doesNotThrow(() => assertCanReadKanbanReports(coach))
  })

  it("ejecutor puede mover y bloquear; no liberar ni retornar ni rank", () => {
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.BOARD_MOVE), true)
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.BOARD_BLOCK), true)
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.RELEASE_TO_FLOW), false)
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.BACKLOG_RANK), false)
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.BOARD_RETURN_TO_BACKLOG), false)
    assert.doesNotThrow(() => assertCanMoveKanbanBoardItem(dev))
    assert.doesNotThrow(() => assertCanBlockKanbanBoardItems(dev))
    assert.throws(() => assertCanReleaseToFlow(dev), KanbanBacklogForbiddenError)
    assert.throws(() => assertCanRankKanbanBacklog(dev), KanbanBacklogForbiddenError)
    assert.throws(() => assertCanReturnKanbanBoardItemsToBacklog(dev), KanbanBoardForbiddenError)
  })

  it("coordinación (SM/PO) puede rank, release y return", () => {
    assert.doesNotThrow(() => assertCanRankKanbanBacklog(sm))
    assert.doesNotThrow(() => assertCanReleaseToFlow(sm))
    assert.doesNotThrow(() => assertCanReturnKanbanBoardItemsToBacklog(sm))
    assert.doesNotThrow(() => assertCanRankKanbanBacklog(po))
    assert.doesNotThrow(() => assertCanReleaseToFlow(po))
    assert.doesNotThrow(() => assertCanReturnKanbanBoardItemsToBacklog(po))
  })

  it("solo admin/operator configuran flujo", () => {
    assert.equal(kanbanMemberHasFlowConfigure(admin), true)
    assert.equal(kanbanMemberHasFlowConfigure(operator), true)
    assert.equal(kanbanMemberHasFlowConfigure(sm), false)
    assert.equal(kanbanMemberHasFlowConfigure(po), false)
    assert.doesNotThrow(() => assertCanConfigureKanbanFlow(admin))
    assert.throws(() => assertCanConfigureKanbanFlow(sm), ProjectKanbanFlowConfigureForbiddenError)
  })

  it("auditor lee metrics/reports pero no mueve tablero", () => {
    assert.doesNotThrow(() => assertCanReadKanbanMetrics(auditor))
    assert.doesNotThrow(() => assertCanReadKanbanReports(auditor))
    assert.throws(() => assertCanMoveKanbanBoardItem(auditor), KanbanBoardForbiddenError)
  })

  it("sin rol no obtiene lectura ni edición", () => {
    assert.throws(() => assertCanReadKanbanBacklog(none), KanbanBacklogForbiddenError)
    assert.throws(() => assertCanMutateKanbanBacklogContent(none), KanbanBacklogForbiddenError)
    assert.throws(() => assertCanReadKanbanMetrics(none), KanbanMetricsForbiddenError)
    assert.throws(() => assertCanReadKanbanReports(none), KanbanReportsForbiddenError)
  })

  it("flow_time.read alinea a metrics.read; flow_time.detail.read excluye auditor", () => {
    assert.equal(
      kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.FLOW_TIME_READ),
      kanbanMemberHasCapability(coach, KANBAN_CAPABILITY.METRICS_READ),
    )
    assert.equal(kanbanMemberHasCapability(auditor, KANBAN_CAPABILITY.FLOW_TIME_READ), true)
    assert.equal(kanbanMemberHasCapability(auditor, KANBAN_CAPABILITY.FLOW_TIME_DETAIL_READ), false)
    assert.equal(kanbanMemberHasCapability(dev, KANBAN_CAPABILITY.FLOW_TIME_DETAIL_READ), true)
  })

  it("kanbanMemberHasCapability delega coherente para cada clave", () => {
    for (const cap of Object.values(KANBAN_CAPABILITY)) {
      assert.equal(typeof kanbanMemberHasCapability(dev, cap), "boolean")
    }
  })
})
