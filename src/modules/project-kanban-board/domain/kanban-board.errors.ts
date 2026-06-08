export class KanbanBoardForbiddenError extends Error {
  readonly code = "kanban_board_forbidden"

  constructor(message = "Not allowed to access the Kanban board.") {
    super(message)
    this.name = "KanbanBoardForbiddenError"
  }
}

export class KanbanBoardNotFoundError extends Error {
  readonly code = "kanban_board_not_found"

  constructor(message = "Kanban board item not found.") {
    super(message)
    this.name = "KanbanBoardNotFoundError"
  }
}

export class KanbanBoardValidationError extends Error {
  readonly code = "kanban_board_validation_error"

  constructor(message: string) {
    super(message)
    this.name = "KanbanBoardValidationError"
  }
}

/** v1: política `warning` y movimiento tocaría/excedería límite; reenviar con `kanban_wip_move_ack: true`. */
export class KanbanBoardWipMoveAckRequiredError extends Error {
  readonly code = "kanban_wip_move_ack_required"
  readonly requiresWipMoveAck = true
  readonly currentCount: number
  readonly wipLimit: number
  readonly toColumnPublicId: string
  readonly policy: string
  readonly projectedCountAfterMove: number

  constructor(
    message: string,
    detail: {
      currentCount: number
      wipLimit: number
      toColumnPublicId: string
      policy: string
      projectedCountAfterMove: number
    },
  ) {
    super(message)
    this.name = "KanbanBoardWipMoveAckRequiredError"
    this.currentCount = detail.currentCount
    this.wipLimit = detail.wipLimit
    this.toColumnPublicId = detail.toColumnPublicId
    this.policy = detail.policy
    this.projectedCountAfterMove = detail.projectedCountAfterMove
  }
}

/**
 * Política `blocking` y el movimiento excedería WIP: reintento con
 * `kanban_wip_override_reason` (roles: admin, operator, agility_lead, scrum_master).
 */
export class KanbanBoardWipLimitBlockedError extends Error {
  readonly code = "wip_limit_blocked"
  readonly requiresWipOverride = true
  readonly requiresWipOverrideReason = true
  readonly currentCount: number
  readonly wipLimit: number
  readonly toColumnPublicId: string
  readonly policy: string
  readonly projectedCountAfterMove: number

  constructor(
    message: string,
    detail: {
      currentCount: number
      wipLimit: number
      toColumnPublicId: string
      policy: string
      projectedCountAfterMove: number
    },
  ) {
    super(message)
    this.name = "KanbanBoardWipLimitBlockedError"
    this.currentCount = detail.currentCount
    this.wipLimit = detail.wipLimit
    this.toColumnPublicId = detail.toColumnPublicId
    this.policy = detail.policy
    this.projectedCountAfterMove = detail.projectedCountAfterMove
  }
}

export class KanbanWipOverrideForbiddenError extends Error {
  readonly code = "wip_override_forbidden"

  constructor(message = "WIP override is not allowed for this role.") {
    super(message)
    this.name = "KanbanWipOverrideForbiddenError"
  }
}
