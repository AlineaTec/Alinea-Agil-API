/** Días hacia atrás mínimos de log de auditoría a cargar para replay (alineado a project-kanban-metrics). */
export const FLOW_TIME_AUDIT_LOOKBACK_DAYS = 400

/** Rango máximo de ventana (días) para agregado on-demand. */
export const FLOW_TIME_MAX_RANGE_DAYS = 366

/** Semanas rolling por defecto si no se envían bordes (v1: 12 semanas). */
export const FLOW_TIME_DEFAULT_WEEKS = 12

/** Umbral mínimo de ítems para `hasSufficientData` (OQ-02). */
export const FLOW_TIME_LOW_SAMPLE_THRESHOLD = 5

/** Precisión: un decimal (días). */
export const FLOW_TIME_DAYS_FRACTION_DIGITS = 1
