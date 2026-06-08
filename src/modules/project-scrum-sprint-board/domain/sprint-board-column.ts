/** Columnas fijas del sprint board (MVP). */
export const SPRINT_BOARD_COLUMNS = ["to_do", "in_progress", "in_review", "done"] as const

export type SprintBoardColumn = (typeof SPRINT_BOARD_COLUMNS)[number]

export function isSprintBoardColumn(v: string): v is SprintBoardColumn {
  return (SPRINT_BOARD_COLUMNS as readonly string[]).includes(v)
}
