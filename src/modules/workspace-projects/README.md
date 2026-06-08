# workspace-projects (API)

Núcleo backend del **project draft**: agregado único del wizard de creación guiada de proyectos, alineado a `contracts-docs/docs/modules/workspace-projects/` y `draft-model-and-state-machine.md`.

## Qué incluye esta fase

- **Dominio:** `ProjectDraftState`, estados, enfoques (`scrum` \| `kanban` \| `predictive_phases` \| `not_ready_to_start`), charter, evaluación, recomendación, trazas, materialización.
- **Persistencia:** PostgreSQL / Prisma
- **Repositorio:** insert, replace, find por workspace + draft, list por workspace.
- **Políticas:** transiciones y gates mínimos (`project-draft-transition.policy.ts`); autorización (`project-draft-authorization.policy.ts`).
- **Servicio:** `createDraft`, `saveCharter`, `saveAssessment`, `recommendDraft` (stub → `recordRecommendation`), `recordDecision`, `markNotReadyComplete`, `materializeDraft` (stub de id de proyecto).
- **Motor sustituto:** `project-draft-recommendation-stub.ts` (`engineVersion: stub-0.2.0`) hasta motor por reglas/ML — sesgo por naturaleza del trabajo, demanda reactiva vs aptitud de timebox, incertidumbre interpretada (descubrimiento vs operativa).

## Decisiones conservadoras

1. **Gates:** charter listo para evaluación = `name` y `description` no vacíos; evaluación lista para recomendar = al menos **5** claves con valor. Sustituir cuando se cierren umbrales en `open-questions.md`.
2. **`assessment_in_progress`:** se entra al primer `saveAssessment` con charter válido; si el charter deja de cumplir el gate, el estado vuelve a `definition_in_progress`.
3. **`materializeDraft`:** no crea proyecto operativo real; asigna `prj_stub_<uuid>` y deja TODO para el módulo de proyectos. **Idempotente** si `status === "materialized"`.
4. **`markNotReadyComplete`:** idempotente si ya `not_ready_complete`; exige `decision_recorded` y `selectedApproach === "not_ready_to_start"`.
5. **Sobrescritura:** `overrideJustification` es opcional en HTTP; el servicio solo la persiste si `wasRecommendationOverridden` (no se exige texto obligatorio en esta fase).

## HTTP preliminar

Montado en `app.ts` bajo `/v1/workspaces/:workspacePublicId/projects/drafts`:

| Método | Ruta |
|--------|------|
| POST | `/` — crear draft (`projectName` opcional) |
| GET | `/` — listar |
| PATCH | `/:draftPublicId/charter` |
| PATCH | `/:draftPublicId/assessment` |
| POST | `/:draftPublicId/recommend` — cuerpo `{}` estricto |
| POST | `/:draftPublicId/decision` — `{ selectedApproach, overrideJustification? }` |
| POST | `/:draftPublicId/not-ready-complete` — cuerpo `{}` estricto |
| POST | `/:draftPublicId/materialize` — cuerpo `{}` estricto |
| GET | `/:draftPublicId` |

Autenticación: `requireBearerAuth` + actor miembro. **Autorización preliminar:** operaciones anteriores exigen `admin`, `operator` o `agility_lead` (`assertCanAccessProjectDraftWizardPreliminary`). Respuestas mutación/lectura de detalle: **200** `{ draft: … }` salvo errores documentados (400 / 401 / 403 / 404).

## Próximos pasos

- Sustituir stub de recomendación y stub de materialización por implementación real.
- Ajustar lectura para `auditor` si aplica (`WP-03`).
- Wizard en `web` contra estas rutas.
