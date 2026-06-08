# `product-idea-feedback`

Recolección de **feedback de producto** sobre **ideas o capacidades** publicadas: señal cualitativa y estructurada para producto, **no** help desk, tickets, chat ni incidencias.

**Contrato funcional (fuente de verdad):** `contracts-docs/docs/modules/product-idea-feedback/`.

## Qué es / qué no es

| Sí | No |
|----|-----|
| Opinión de valor, claridad, mejora (texto + reacción) | Cola de soporte o SLA |
| Triage y estados en **plataforma** (`/v1/platform`) | Respuesta al usuario por este módulo |
| Un envío **por** usuario **por** idea | Reenvíos o versiones en v1 |
| Estados internos (`misrouted_support`, etc.) **sin** integración externa | Zendesk, Jira Service, etc. en v1 |
| Colecciones `product_ideas`, `product_idea_feedback_entries`, `product_idea_feedback_entries_audit_events` | Export masivo o BI (post-v1) |

## Superficies HTTP

| Contexto | Base | Auth |
|----------|------|------|
| **Web (workspace)** | `POST/GET` bajo `/v1/workspaces/:workspacePublicId/product-ideas/:ideaPublicId/feedback` | Bearer **cliente** + miembro del workspace |
| **Admin (plataforma)** | `GET/PATCH` bajo `/v1/platform/product-idea-feedback` y `GET` catálogo mínimo `.../product-ideas` | Bearer **plataforma** (`platformAuthMiddleware`) |

> En el repo, **admin** se implementa bajo `/v1/platform/*`, alineado al resto de módulos de plataforma (equivalente funcional a “admin” en `contracts-docs`).

### Endpoints

**Workspace**

- `GET .../feedback/eligibility` → `{ canSubmit, reason }` (`reason`: `IDEA_NOT_VISIBLE` | `FEEDBACK_DISABLED` | `ALREADY_SUBMITTED` | `null`)
- `POST .../feedback` → `{ feedbackPublicId }` (201)

**Plataforma**

- `GET /v1/platform/product-idea-feedback` — listado (filtros: `reviewStatus`, `ideaPublicId`, `workspacePublicId`, `from`, `to`, `limit`, `offset`)
- `GET /v1/platform/product-idea-feedback/:feedbackPublicId` — detalle
- `PATCH /v1/platform/product-idea-feedback/:feedbackPublicId` — `reviewStatus`, `internalTags`, `internalNotes`
- `GET /v1/platform/product-ideas` — listado mínimo de ideas (catálogo; CRUD editorial completo es módulo hermano)
- `GET /v1/platform/product-ideas/:ideaPublicId` — detalle mínimo

## Reglas v1 soportadas

- Idea **anclada** siempre: solo `status = published` y `isFeedbackEnabled` para `POST` desde workspace.
- **Reacción** obligatoria; al menos un texto (`likedWhat` o `couldImproveWhat`) con **≥ 20** caracteres (tras trim); máx. 2000 c/u; `additionalComment` opcional (máx. 4000).
- **Unicidad** `(workspacePublicId, ideaPublicId, userPublicId)`.
- **Sin anónimo:** `userPublicId` del token; `submitterDisplayName` desde el miembro.
- `projectPublicId` opcional: se valida contra **proyecto operativo** del workspace (`WorkspaceRuntimeProjectLookup`).
- Estados de revisión **exactamente**: `new`, `in_review`, `reviewed`, `actionable`, `duplicate`, `out_of_scope`, `not_product_feedback`, `misrouted_support`.
- **PII mínima en plataforma:** en detalle, `userPublicId` **omitido** para `platform_auditor`; **notas internas** nunca al cliente.
- **Auditoría** propia: eventos `feedback_created` y `admin_review_updated` en `product_idea_feedback_entries_audit_events`.

## Permisos (capabilities lógicas)

| Capability | Comportamiento en código |
|------------|---------------------------|
| `idea-feedback.submit` | Miembro workspace **no** `deactivated` (`assertCanSubmitProductIdeaFeedbackEntry`) |
| `idea-feedback.read-admin` | Cualquier rol plataforma activo (listado/detalle) |
| `idea-feedback.review` + `classify` | `platform_super_admin` y `platform_operator` pueden `PATCH`; `platform_auditor` **no** muta |

## Postergado (no v1)

- Votación pública, roadmap portal, export CSV/JSON masivo, analítica avanzada.
- Edición del texto del envío por el usuario.
- Integración con herramientas de soporte.
- Feedback “general” sin `ideaPublicId`.
- CMS completo de ideas: solo repositorio mínimo + listados para validar y revisar; la editorial rica vive en módulo hermano (contracts).

## Estructura del módulo

- `domain/` — entidades, errores, enums
- `persistence/` — repositorios Prisma, `WorkspaceRuntimeProjectLookup`
- `services/product-idea-feedback.service.ts` — reglas de negocio
- `policies/` — workspace submit; plataforma lectura/mutación
- `validation/` — esquemas Zod HTTP
- `routes/` — workspace vs platform
- `product-idea-feedback.module.ts` — fábrica y montaje

## Tests

`npm test` incluye `product-idea-feedback.service.test.ts` (repositorios en memoria).
