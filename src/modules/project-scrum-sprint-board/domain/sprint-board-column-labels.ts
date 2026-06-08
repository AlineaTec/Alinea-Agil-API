import type { SprintBoardColumn } from "./sprint-board-column.js"
import { isSprintBoardColumn } from "./sprint-board-column.js"

/** Etiquetas de columnas del tablero de sprint (mismo criterio que la app web). */
const LABELS: Record<SprintBoardColumn, string> = {
  to_do: "Por hacer",
  in_progress: "En progreso",
  in_review: "En revisión",
  done: "Hecho",
}

export function sprintBoardColumnLabel(column: string): string {
  if (isSprintBoardColumn(column)) return LABELS[column]
  return column
}
