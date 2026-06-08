/**
 * Límites alineados a `contracts-docs` project-kanban-core (open-questions §16).
 * Valores conservadores dentro del rango documentado.
 */
export const KANBAN_MAX_COLUMNS = 12
export const KANBAN_MAX_COLUMN_NAME_LENGTH = 80
export const KANBAN_MAX_POLICY_TEXT_LENGTH = 1000

/** Plantilla v1: cuatro columnas; sin columna "Backlog" en el tablero. */
export const KANBAN_DEFAULT_COLUMN_NAMES = [
  "Ready",
  "In Progress",
  "Review",
  "Done",
] as const
