# Notificaciones de actividad de trabajo (v1)

Notificaciones in-app para cambios relevantes en ítems de backlog asignables (historias, tareas, etc.): asignación, estado, tablero Kanban, bloqueos, comentarios/menciones, sprint planning y movimientos en el tablero de sprint.

## Responsabilidad vs. seguimiento (v1)

- **Responsabilidad (`isResponsibilityRelated`)**: el usuario es el **asignado actual** del ítem.
- **Seguimiento (`isFollowingRelated`)**: relación **implícita** por interacción en los últimos **30 días** (comentar, actuar sobre el ítem, asignación, mención, etc.). No hay follow/unfollow explícito en v1.
- Una misma fila puede tener **ambas** banderas cuando aplica.

## Eventos v1 (`eventType`)

`ASSIGNED`, `UNASSIGNED`, `STATUS_CHANGED`, `KANBAN_COLUMN_MOVED`, `BLOCKED`, `UNBLOCKED`, `COMMENT_ADDED`, `MENTIONED_IN_COMMENT`, `CLOSED`, `REOPENED`, `SPRINT_ADDED`, `SPRINT_REMOVED`.

## Dedupe y fusión

- **Retry técnico**: índice único por `dedupeKey` (hash estable de operación + destinatario).
- **Mención + comentario**: una sola notificación por destinatario (`MENTIONED_IN_COMMENT` si fue mencionado; si no, `COMMENT_ADDED`).
- **Ráfagas**: fusión en ventana de **30 s** para el mismo actor, mismo ítem y mismo tipo (`STATUS_CHANGED` o `KANBAN_COLUMN_MOVED`), actualizando título/resumen y `triggeredAt`.

## Lectura

- Marcar leída explícita: `PATCH /v1/me/notifications/:notificationPublicId/read` (idempotente respecto a `readAt`).
- Marcar todas: `POST /v1/me/notifications/mark-all-read` con cuerpo opcional `workspacePublicId` y `daysWindow`.

## Retención y panel

- Retención visible: **90 días** (`daysWindow` máximo 90; por defecto **30** para el panel rápido).
- Paginación: **50** ítems por página por defecto (hasta 100).

## Limitaciones v1

Sin email, push, preferencias granulares, follow explícito, feed de proyecto amplio, severidad ni mezcla con billing.

## Postergado

Follow/unfollow explícito, canales email/push, preferencias avanzadas, feed de proyecto dedicado, severidad silenciosa/comercial.
