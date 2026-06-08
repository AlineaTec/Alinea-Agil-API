# `product-feedback` (canónico v1)

Captura **unificada** de **feedback de producto** desde clientes workspace y triage en **plataforma** (`/v1/platform`), alineada a `contracts-docs/docs/modules/product-feedback-and-suggestions/`.

## Propósito

- **`existing_feature_feedback`**: percepción sobre funcionalidad **ya existente** (pantalla, módulo, flujo).
- **`new_feature_suggestion`**: propuesta de **capacidad nueva** o hueco funcional.

**No** es help desk, soporte operativo ni billing. Los estados `misrouted_support` / `bug` son etiquetas de **triage interno**, sin tickets ni SLA.

## Relación con `product-idea-feedback` (legacy)

- **`product-idea-feedback`** sigue activo: rutas workspace bajo `.../product-ideas/:ideaPublicId/feedback` y plataforma bajo `/v1/platform/product-idea-*`.
- **`product-feedback`** es el **contrato canónico** nuevo: colecciones `product_feedback_submissions` y `product_feedback_audit_events`.
- Convivencia temporal (**sin dual-write** entre ambos): un envío **legacy** no crea fila canónica y viceversa; migración de datos deudora [P].

## Modelo persistido (`ProductFeedbackSubmission`)

| Campo lógico | Notas |
|--------------|--------|
| `submissionPublicId` | Id público estable |
| `workspacePublicId`, `userPublicId` | Tenencia / autor |
| `submissionType` | `existing_feature_feedback` \| `new_feature_suggestion` |
| `title` | Obligatorio solo para `new_feature_suggestion` (max 120) |
| `body` | 20–4000 caracteres (trim) |
| `ideaPublicId` | Opcional; si viene → misma regla publicado + `isFeedbackEnabled` que legacy; **unicidad** `user + workspace + idea` |
| `moduleKey`, `route`, `screenContext`, `projectPublicId`, `operationalApproach` | Contexto; `route` por defecto `general_entry` si no se envía |
| `sourceSurface`, `reaction?` | `reaction` opcional (no requerida para validez) |
| Triage | `status`, `internalTags`, `internalNotes`, `misroutingCategory`, `duplicateOfSubmissionPublicId`, `reviewDisposition`, `reviewedByPlatformUserId`, `reviewedAt` |

## Estados de revisión

`new`, `in_review`, `useful`, `actionable`, `duplicate`, `out_of_scope`, `misrouted_support`, `bug`, `discarded`.

- **`duplicate`**: exige `duplicateOfSubmissionPublicId` apuntando a otro envío existente.
- **`misrouted_support`**: `misroutingCategory` opcional; enum cerrado: `billing`, `access`, `data_request`, `usage_help`, `import`, `other`.

## API

### Workspace (`web`)

| Método | Ruta |
|--------|------|
| `POST` | `/v1/me/product-feedback` |
| `GET` | `/v1/me/product-feedback/eligibility?workspacePublicId=&ideaPublicId=` |

Cuerpo `POST` incluye `workspacePublicId` y campos del contrato; aplica **billing gate** de mutación como otras rutas workspace.

### Plataforma (`admin`)

| Método | Ruta |
|--------|------|
| `GET` | `/v1/platform/product-feedback` |
| `GET` | `/v1/platform/product-feedback/:submissionPublicId` |
| `PATCH` | `/v1/platform/product-feedback/:submissionPublicId` |

Filtros listado: `submissionType`, `status`, `workspacePublicId`, `moduleKey`, `projectPublicId`, `ideaPublicId`, `misroutingCategory`, `q`, `createdFrom`, `createdTo`, `limit`, `offset`.

## Permisos plataforma

| Rol | Lectura | PATCH | `actionable` | `internalNotes` en detalle |
|-----|---------|-------|--------------|----------------------------|
| `platform_super_admin` | sí | sí | sí | sí |
| `platform_operator` | sí | sí | sí | sí |
| `platform_auditor` | sí | **no** | — | **omitido** |

## Auditoría

Eventos en `product_feedback_audit_events`: `submission_created`, `admin_review_updated`, `admin_idea_associated`.

## Limitaciones v1 (cerradas)

- Sin adjuntos, sin historial de envíos para el usuario, sin edición/retiro por el usuario.
- Sin IA de deduplicación, sin roadmap público, sin integración help desk.

## Errores frecuentes (`error` en JSON)

- `title_required_for_suggestion`, `body_validation`, `invalid_screen_context`
- `duplicate_idea_submission` (409)
- `idea_not_found`, `submission_not_found`
- `duplicate_target_required`, `duplicate_target_not_found` (422)
- `invalid_misrouting_category`, `forbidden`, `forbidden_actionable`
