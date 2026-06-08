# Módulo `team-operational-metrics` (métricas operativas de equipos)

## Propósito

API de **lectura** para acompañar **carga, flujo y salud operativa** de equipos y miembros, alineada a `contracts-docs` (slug `team-operational-metrics`). **No** es analítica de RR.HH., desempeño individual punitivo ni ranking de “mejores” personas.

## Qué mide (v1) y qué no

**Incluido (v1):** conteos de trabajo activo (ítems de backlog `open` | `in_progress`, **excluyendo `epic`**), asignado vs sin asignar, bloqueo vía `isBlocked` en el ítem, miembros activos del equipo, `targetSize` y `capacityGap` (`targetSize − activeMembers` si `targetSize` está definido), impedimentos abiertos por proyecto vinculado (estados `open`, `in_review`, `mitigating`) y desglose aproximado de impedimentos “sobre” trabajo asignado a cada persona (vía `relatedWorkItemPublicId` → asignatario del ítem en ese proyecto), señal de mezcla Scrum/Kanban, advertencias de calidad de dato, buckets de carga operativa y umbrales explícitos de **ociosidad** y **sobrecarga**.

**No incluido (v1, explícitamente pospuesto):** velocity/throughput unificados entre metodologías, lead/cycle time complejo, puntuaciones opacas, recomendaciones automáticas, preagregación o snapshots. El diseño (servicio puro, agregación en funciones) permite añadir caché o tablas de hechos más adelante.

## Definiciones v1 (transparencia)

- **Miembro activo:** filas de membresía con `isActive: true` y `listByTeam(..., { activeOnly: true })` (misma lógica que el resto del producto en equipos).
- **Carga asignada activa / sin asignar / bloqueada:** en el universo de proyectos vinculados al equipo; ítems con `itemType !== epic` y `status` en `open` | `in_progress`. **Bloqueado:** `isBlocked` en el ítem (en Scrum puro suele ser `false`; en Kanban aporta señal).
- **Impedimentos de equipo (conteo):** agregado por **proyectos vinculados** al equipo; no existe `teamPublicId` en el modelo de impedimento en v1 (aproximación documentada: alcance = proyectos del equipo). Severidad `critical` para el contador crítico.
- **Impedimentos “por asignatario”:** solo cuando el impedimento referencia un ítem; se atribuyen al `assignedUserPublicId` de ese ítem (si el ítem no tiene asignatario, no se suma a ninguna persona).
- **`isIdle` (miembro):** cero ítems activos asignados a esa persona en el alcance.
- **`isOverloaded`:** `activeAssignedWorkItemsCount >= 8` (constante `OPERATIONAL_LOAD_OVERLOAD_MIN_ACTIVE_ITEMS`).
- **Niveles de carga (`currentLoadLevel`):** `idle` (0) → `low` (1–2) → `normal` (3) → `high` (4–7) → `very_high` (8+), según conteo de ítems activos asignados.

## Metodología (Scrum vs Kanban)

- Cada resumen/ítem de lista incluye `methodologyContext` a nivel de proyectos vinculados: `scrum` | `kanban` | `mixed` | `other` | `unknown`.
- En **lista cross-team**, se expone además `methodologyContextWorkspace` y, si aplica, advertencias (p. ej. mezcla Scrum/Kanban en el workspace), sin fusionar **velocity** Scrum con **throughput** Kanban en un solo valor.

## Permisos (v1, conservador)

Mapeo lógico a intención de producto; implementación: funciones en `policies/team-operational-metrics-authorization.policy.ts`.

| Capacidad lógica | Comportamiento v1 |
|------------------|-------------------|
| `team-metrics.read` | Cualquier miembro de workspace **activo** o `active_without_seat` (incl. **auditor** en agregado de equipo). |
| `team-metrics.member-breakdown.read` | `admin`, `operator`, `agility_lead`, `scrum_master`, `product_owner`, `scrum_coach`. **No** `scrum_developer` ni `auditor`. |
| `team-metrics.cross-team.read` | Igual a breakdown excepto **auditor**; **tampoco** `scrum_developer` (evitar comparativa cross-team amplia). `scrum_coach` **sí** según postura v1. |

## Endpoints

- `GET /v1/workspaces/:workspacePublicId/teams/:teamPublicId/metrics/summary?projectPublicId=`
- `GET /v1/workspaces/:workspacePublicId/teams/:teamPublicId/metrics/members?projectPublicId=`
- `GET /v1/workspaces/:workspacePublicId/metrics/teams?limit=&offset=&includeArchived=true|false&projectPublicId=`

Cálculo **on-demand**; el README describe cómo evolucionar a materialización sin cambiar contratos de lectura de alto nivel.

## Calidad de dato

Respuestas incluyen al menos: `hasSufficientData` (a nivel de resumen de equipo), `dataQualityWarnings` (códigos o mensajes breves) y, donde aplica, `calculationNotes` (lista) para que la UI no sobre-interprete mezcla de enfoques o lagunas (sin asignar, sin proyectos, etc.).
