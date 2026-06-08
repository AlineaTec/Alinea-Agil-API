export class BoardColumnItemMovementForbiddenError extends Error {
  readonly code = "board_item_movement_forbidden" as const
  constructor(message: string) {
    super(message)
    this.name = "BoardColumnItemMovementForbiddenError"
  }
}

/** `from_column_public_id` no coincide con la columna actual del ítem (409 por conflicto de estado). */
export class BoardColumnMismatchError extends Error {
  readonly code = "board_column_mismatch" as const
  constructor(message = "from_column_public_id does not match the item's current column.") {
    super(message)
    this.name = "BoardColumnMismatchError"
  }
}

/** Cuerpo o proyecto incoherente (p. ej. falta `sprint_public_id` en Scrum). */
export class BoardItemMoveContextError extends Error {
  readonly code = "board_move_context_invalid" as const
  constructor(message: string) {
    super(message)
    this.name = "BoardItemMoveContextError"
  }
}
