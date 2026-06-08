# Guided Review (Review Guiada) — módulo API v1

## Propósito

Review Guiada apoya **inspección del incremento** en sesión (en vivo o asíncrona), con trazabilidad de lo demostrado, feedback estructurado, impacto sugerido en backlog/prioridad y cierre del facilitador. No constituye aceptación contractual, UAT, retrospectiva ni planning.

## Diferencias respecto a otros rituales

| Concepto | Review Guiada v1 |
|----------|------------------|
| Sprint Review / inspección | Sí: foco en incremento mostrado y conversación honesta |
| UAT / aceptación contractual | No |
| Sprint Planning / refinamiento de backlog ejecutivo | No |
| Retrospectiva | No |

## Modelo híbrido (roles)

- **PO / dueño de backlog:** contexto de valor, conclusiones de backlog/prioridad, lectura funcional.
- **Developers:** qué se demostró, límites técnicos, aclaraciones sobre el incremento.
- **Scrum Master / facilitador:** resumen, acuerdos, follow-ups, cierre metodológico.
- **Stakeholders externos:** en v1 no escriben en la API; un **miembro interno autorizado** captura feedback atribuido (nombre/display opcional).

## “Demostrado” vs aceptación

El término operativo es **demostrado** (con variantes como demostrado con observaciones o requiere seguimiento). **No** implica aprobación legal ni cierre formal de entregables.

## Feedback general vs por ítem

- **Por ítem:** entradas de feedback con `affectsWorkItemPublicIds` no vacío; además existen filas de **ítem demostrado** ligadas a `workItemPublicId`.
- **General:** `affectsWorkItemPublicIds` vacío → `isGeneralFeedback: true`, explícito en el modelo.

Los comentarios ordinarios de work item y el feedback de review permanecen **dominios separados** en v1.

## Sesión: lazy, unicidad, cierre

- Creación **lazy** al primer endpoint que materializa la sesión (cabecera, demo o feedback).
- Unicidad lógica `(projectPublicId, sessionDate, sessionSlot)`; slot por defecto `default` en v1.
- Estados: `open`, `closed`, `closed_without_decisions` (cierre sin aportes de demo/feedback).
- **Sin reapertura** tras cierre: solo **nota aditiva** o una **sesión futura** nueva.

## Sprint goal assessment

Valores: `achieved`, `partially_achieved`, `compromised`, `unclear`, `not_applicable`.  
Si `partially_achieved`, el campo de explicación breve es **obligatorio** (OQ-GREV-7).  
En **Kanban**, si no se envía valor al cerrar, el backend fija `not_applicable` para honestidad metodológica.

## Enfoque operativo (`operationalApproach`)

- **Scrum:** experiencia completa; sesión puede enlazar sprint activo al crearse.
- **Kanban:** review de entrega/flujo (degradada pero visible); sin depender de sprint.
- **Predictive (`predictive_phases`):** lectura degradada (`guidedReviewOperable: false`); **mutaciones** rechazadas con error de soporte v1 (no se finge Sprint Review Scrum).

## Zona horaria operativa

`sessionDate` y “hoy” usan la misma resolución que Daily Alignment / Guided Refinement: variable de entorno `WORKSPACE_OPERATIONAL_TIME_ZONE` si es IANA válida; si no, `UTC`. No usar solo UTC como fecha de negocio implícita sin este contrato.

## Permisos (resumen)

- **Lectura:** alineado a lectura de runtime de proyecto.
- **Demostraciones y feedback:** alineado a quien puede leer el backlog compartido (contribución ligera, no mutación de ítems de backlog).
- **Cierre y nota aditiva:** Scrum Master, agility lead, product owner (PO como facilitador autorizado), admin u operator.

## Auditoría

Eventos en `workspace_audit_log` con categoría `guided_review_session` (creación lazy, cabecera, demo, feedback, cierre, nota aditiva).

## Límites v1 y lo postergado

**Incluido:** inspección, trazas, flags explícitos de impacto en backlog/prioridad y follow-up sugerido (sin automatismo).  
**Postergado:** scoring, IA generativa fuerte, aceptación contractual, automatismos de creación de ítems de backlog, integración rica con comentarios externos, moderación pesada.

## Contrato funcional

Fuente de verdad: `contracts-docs/docs/modules/guided-review/` (overview, flows, UI states, acceptance, API needs, open questions cerradas).
