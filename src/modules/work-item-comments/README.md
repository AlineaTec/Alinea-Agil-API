# Work item comments (MVP)

Slice backend para comentarios de texto plano en ítems del backlog Scrum. Alineado con `contracts-docs` (`work-item-comments`, `project-scrum-permissions`).

## Colección

Los comentarios viven en una tabla PostgreSQL

## Soft delete

Los borrados son lógicos (`deletedAt`, `deletedByUserPublicId`). Las lecturas listan solo comentarios activos. Un segundo `DELETE` sobre el mismo comentario devuelve **404** (no idempotente en éxito repetido).

## `commentsCount` en el ítem

El campo `commentsCount` en el estado del backlog item se mantiene con `adjustCommentsCount(+1)` al crear y `adjustCommentsCount(-1)` al soft-delete. El decremento solo aplica si el contador no quedaría negativo. **No** incluye comentarios ya borrados.

**Trade-off:** si el incremento falla tras insertar el comentario (caso raro), puede quedar un comentario huérfano respecto al contador; no hay transacción multi-documento en esta fase.

## Lectura y permisos

- **Lectura:** quien puede leer el backlog Scrum **o** el sprint board puede listar comentarios del ítem (misma idea que “puede ver el ítem operativamente o en contexto de lectura”).
- **Crear / editar propio / borrar propio:** roles que mutan comentarios propios (excluye `auditor` y `scrum_coach`, solo lectura).
- **Borrar ajeno:** misma familia que puede mutar el sprint board (`admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`). La coordinación **no** edita el texto de comentarios ajenos.

## API (Scrum backlog item)

Rutas montadas bajo el router del backlog:

- `GET .../scrum-backlog/items/:backlogItemPublicId/comments` — cursor, orden ascendente por `createdAt`, límite por defecto 20.
- `POST` — cuerpo plano, trim, máx. 4000 caracteres Unicode.
- `PATCH` — solo autor; comentario borrado no editable.
- `DELETE` — autor o moderación.

## Fuera de alcance (TODOs)

- Snippet / último comentario en listas
- Menciones
- Adjuntos
- Markdown / enriquecido
- Anonimización / compliance
- Identificador neutral Kanban (`workItemPublicId`) — hoy `backlogItemPublicId`
- Hilos (threading)
