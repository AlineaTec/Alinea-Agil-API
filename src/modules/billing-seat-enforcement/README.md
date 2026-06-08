# `billing-seat-enforcement` (API)

Implementación **v1 conservadora** de materialización comercial + entitlement operativo por workspace, alineada con `contracts-docs/docs/modules/billing-seat-enforcement/`.

## Propósito

- **Separar** estado **comercial externo** (Paddle / manual) del **entitlement operativo interno** Materializado en PostgreSQL.
- **No** consultar Paddle en cada request HTTP: la verdad usada por guards se lee de **snapshots** persistidos (webhooks / jobs / sync manual futuro).
- Exponer **`GET /v1/workspaces/:workspacePublicId/billing/state|summary`** para `web` (**UI billing completa queda fuera de este slice**).
- **`POST /v1/workspaces/:workspacePublicId/billing/portal-session`** — **excepción acotada**: resuelve **`subscriptionExternalId` → customer Paddle** y crea sesión de **Paddle Customer Portal** (Billing API). Exige **`PADDLE_API_KEY`** servidor y rol **admin/operator** (misma barra que mutar licencias). **`billingSource = manual`** → **400** (`workspace_billing_portal_manual_billing`). Sin vínculo suficiente → **409**. Fallo Paddle → **502**.

## Orquestación comercial real (checkout + mutaciones Paddle)

Capa **`WorkspaceCommercialSubscriptionService`** (`services/workspace-commercial-subscription.service.ts`) centraliza validación de plan/cadencia/asientos y llama a **`integrations/paddle/paddle-billing-rest.ts`** (único cliente REST añadido: **POST /transactions**, **PATCH /subscriptions/:id** y opcional **PATCH …/preview**). **No** se muta `workspace-licenses` en estos handlers: el entitlement sigue actualizándose por **webhooks + reconciliación** como hasta ahora.

| Método | Ruta | Rol | Comportamiento |
|--------|------|-----|----------------|
| `POST` | `.../billing/checkout-session` | admin/operator | Crea **transacción** Paddle (`collection_mode: automatic`) con ítems del catálogo (**Individual** qty 1; **Team** base qty 1 + **Additional Seat** si `desiredSeats > 3`). `custom_data.workspace_public_id` para retorno webhook/huérfanos. Respuesta: `{ checkoutUrl, transactionId? }`. Rechaza si ya hay **`subscriptionExternalId`** y el estado de facturación **no** es terminal (`cancelled` / `expired`). |
| `POST` | `.../billing/seat-increase` | admin/operator | **Team** activo: **`PATCH` suscripción** con lista completa de ítems; solo sube **`quantity`** de **Additional Seat**; base siempre 1; **`proration_billing_mode`: `prorated_immediately`**. |
| `POST` | `.../billing/seat-reduction-schedule` | admin/operator | Programa **`workspace-licenses.scheduleSeatReduction`** (próximo **`nextRenewalDate`**, sin bajar cupo hoy) y luego **`PATCH` Paddle** con **`proration_billing_mode`: `full_next_billing_period`**. Valida **`desiredSeats` ≥ usuarios activos con asiento** (`countActiveSeatConsumingMembers`). Si Paddle falla tras programar la licencia → **502** `paddle_subscription_update_failed_after_internal_schedule`. |
| `POST` | `.../billing/upgrade-individual-to-team` | admin/operator | **`PATCH`** reemplaza ítem Individual por **Team base + Additional Seat** según `desiredSeats` y **conserva la cadencia** ya observada en la suscripción; **`prorated_immediately`**. |

**Errores de dominio** (código estable en JSON `error`): p.ej. `commercial_catalog_not_configured`, `workspace_billing_not_paddle`, `individual_rejects_addon`, `workspace_billing_subscription_already_linked`, `workspace_billing_missing_paddle_subscription`, `commercial_subscription_items_ambiguous`, `commercial_transition_not_supported`, `commercial_active_users_exceed_target`, `paddle_remote_error` (502, con `details.paddleHttpStatus` si aplica).

**Auditoría workspace** (`workspace_audit_events`): categoría **`workspace_billing_commercial`** con acciones `paddle_checkout_session_created`, `paddle_team_seat_increase_applied`, `paddle_team_seat_reduction_scheduled`, `paddle_upgrade_individual_to_team_applied`.

### Postergado / límites v1

- **Cambio de intervalo** mensual ↔ anual sobre una suscripción existente: **no** expuesto; requiere sustituir **todos** los `price_id` al otro intervalo y política de proration explícita.
- **Preview económico en HTTP**: el servicio expone **`previewTeamSeatIncrease`** para integración futura; **no** hay ruta REST dedicada.
- **Reducción programada + Paddle**: el **entitlement operativo hoy** sigue gobernado por **`workspace-licenses`** y el snapshot interno; si en el futuro los webhooks mostraran discrepancia con el modo `full_next_billing_period`, habría que afinar el pipeline (documentado en `paddle-sync-model.md`).

## Enforcement en rutas de miembros (expansión de cupo)

La política **`assertCanExpandSeatConsumptionFromPublicState`** (`domain/billing-seat-expansion.policy.ts`) centraliza el bloqueo de acciones que **aumentan usuarios efectivos con asiento** (`active` + `hasSeatAssigned`), usando el mismo materializado que **`getBillingState`** (solo **`currentEntitledSeats`**, no capacidad futura programada).

**Inyectado en `app.ts`** vía **`createWorkspaceSeatExpansionGate`** → **`WorkspaceUserService`**:

| Acción | Ruta / método | ¿Gate? |
|--------|----------------|--------|
| Crear miembro **con** `assignSeat: true` | `POST …/members` | Sí |
| Asignar asiento | `POST …/members/:id/assign-seat` | Sí |
| Crear miembro **sin** asiento; activar sin asiento; desactivar; liberar asiento; roles | Resto | No (regularización / sin aumento de cupo efectivo) |

Errores HTTP **403** con `error` discriminado (`billing_expansion_blocked_*`) y `expansionBlockedReason` — ver `BillingSeatExpansionBlockedError`.

**Exento**: **`GET …/billing/state|summary`**, mutaciones de **`workspace-licenses`** que **contratan** capacidad (`increaseSeats`, etc.) — no pasan por este gate.

## Enforcement **producto principal** (mutaciones operativas)

Cuando `guards.canUsePrimaryWorkspaceProductFeatures === false` (`billingStatus` **`suspended_non_payment`**, **`cancelled`**, **`expired`** tras política en `billing-guards.policy.ts`), **`createWorkspaceBillingPrimaryProductMutationGate`** bloquea **POST/PUT/PATCH/DELETE** en routers montados con ese middleware (lecturas GET/HEAD/OPTIONS siguen).

- **Errores**: **`billing_workspace_primary_product_suspended_non_payment`** | **`billing_workspace_primary_product_commercial_terminal`** (403 JSON + `billingStatus`, `billingBlockReason`).
- **Política / rutas exentas** (`domain/billing-workspace-primary-product.policy.ts`): subpaths **`/billing/`**, **`/license/`**, **`/settings/`**, **`…/members/:id/deactivate`**, **`…/members/:id/release-seat`** — billing portal, licencias, ajuste mínimo del workspace y reducción de consumo de asientos.
- **No** sustituye al gate de **expansión de cupo** (invitar/asignar asiento): ese sigue en **`workspace-seat-expansion.gate`**; **sobrecapacidad** no habilita `canUsePrimaryWorkspaceProductFeatures: false` mientras el estado sea activo (solo bloquea expansión).

Montaje: **`billingPrimaryProductMutationGate`** en **`app.ts`** se inyecta en los módulos workspace/project que exponen trabajo (Scrum/Kanban/controles/equipos/metricas/members/project-runtime/etc.). **No** se monta en **`billing`**, **`license`**, **`settings`** por sí mismo (evita trabajo redundante en APIs ya exentas por prefijo).

## Ingesta Paddle (webhooks)

**Ya no es solo el stub de jobs**: existe **`POST /v1/integrations/paddle/webhooks`** (integración backend, **no** es endpoint de usuario workspace).

- Body JSON **crudo** + validación **`Paddle-Signature`** (HMAC-SHA256 según documentación Paddle).
- Variables de entorno: **`PADDLE_WEBHOOK_SECRET`** (secreto del destino de notificaciones en Paddle), opcional **`PADDLE_WEBHOOK_TS_TOLERANCE_SECONDS`** (anti-replay sobre `ts`; por defecto **600** s).
- Si falta `PADDLE_WEBHOOK_SECRET`, la ruta responde **503** (`webhook_secret_not_configured`).
- **`400 invalid_signature`:** el secreto del API no coincide con el **`endpoint_secret_key`** del destino Paddle que envía a esta URL (cada destino tiene su propio secreto; rotación en Paddle), o el proxy alteró el body. Comprobar variable en el runtime que atiende `POST /v1/integrations/paddle/webhooks` (sin comillas ni espacios de más).
- La ruta se monta **antes** de `express.json()` global en `app.ts` para no alterar el payload firmado.

### Eventos Paddle consumidos en v1 (mapeo conservador)

| Evento | Efecto interno típico |
|--------|------------------------|
| `subscription.updated` (+ `created` / `activated` / `resumed`) | Vincula `subscriptionExternalId`; `past_due` → gracia (`applyPaymentRenewalFailure`); `active` → recuperación si aplicaba (`recoverPaymentIfApplicable`); `canceled` → `cancelled`; capacidad efectiva vía items → `workspace-licenses.applyTrustedAbsoluteSeatsPurchased` + reconciliar snapshot; **solo futuro** vía `scheduled_change.items` + `effective_at` futuro → **`paddleScheduled*`** sin subir licencia |
| `subscription.past_due` | Igual que `subscription.updated` con `status: past_due` (Paddle emite este evento dedicado además de, o en lugar de, `updated`) → gracia + hook correo `billing_grace_started` |
| `transaction.payment_failed` | Gracia por fallo materializable (renovación recurrente ligada a suscripción) |
| `transaction.past_due` | Igual que `transaction.payment_failed` (transacción de renovación impaga) → gracia |
| `transaction.completed` | Recuperación si estaba en impago + sincronía de **`entitledSeats`** desde ítems (catálogo `PADDLE_PRICE_*` o legacy suma de `quantity`) |

### Catálogo Paddle (v1) — Team base + Additional Seat

- Con **las 6** variables `PADDLE_PRICE_*` definidas (`commercial-pricing/README.md`), la capacidad se deriva como: **Individual = 1**; **Team = 3 + qty(Additional Seat)**; **Team Base `quantity` ≠ 1** se audita (`team_base_quantity_not_one`) **sin** tratar el exceso como asientos extra.
- **Mezcla mensual/anual** en la misma suscripción → **no** se aplica sync numérico (`mixed_billing_interval_*`); queda evento de auditoría.
- Sin catálogo completo: **legacy** — suma de `quantity` en ítems (comportamiento previo a multi-SKU).

### Ignorados explícitamente en v1

- `subscription.paused` → auditoría `paddle_webhook_ignored` (no mapeado a suspensión interna en esta fase).

### Otros tipos de evento

- Tipos **no** listados en el allowlist interno → respuesta `200` con `{ ignored: true }` (sin auditoría por workspace).

### Idempotencia y huérfanos

- **`event_id`** Paddle: colección **`PaddleWebhookProcessedEvent`** (`eventId` único). Duplicados → `200` + `{ duplicate: true }` sin reejecutar efectos.
- **Huérfanos** (no resoluble workspace): `custom_data.workspace_public_id` ausente **y** snapshot sin `subscriptionExternalId` previo para ese `sub_*` → `200` + `{ orphan: true }` **sin** registrar idempotencia, para permitir **reintento Paddle** cuando exista vínculo o `custom_data`.

### Reconciliación snapshot desde licencias

- `WorkspaceBillingStateService.reconcileSnapshotFromLicense` — materializa snapshot desde `workspace-licenses` tras cambios confiables.
- `WorkspaceBillingStateService.runManualLicenseReconcile` — igual + auditoría `manual_license_reconcile` (cron/soporte).

### Reconciliación comercial Paddle ↔ snapshot (API Billing)

Objetivo: mitigar webhooks perdidos / fuera de orden **sin** llamar Paddle en cada request de usuario.

| Pieza | Rol |
|-------|-----|
| `integrations/paddle/fetch-paddle-subscription.ts` | `GET /subscriptions/:id` → objeto `data` (Billing API v2). |
| `services/paddle-subscription-commercial-effects.ts` | Misma lógica que ingestión `subscription.*` (estado comercial, qty confiable, agenda futura solo-Paddle). Compartida con webhooks. |
| `services/paddle-subscription-commercial-fields.ts` | Extrae `current_billing_period` / `next_billed_at` y construye huella JSON para `commercialExternalSnapshot`. |
| `WorkspaceBillingStateService.applyPaddleCommercialFootprint` | Tras efectos: períodos comerciales + huella + `lastCommercialSyncAt` **sin** sustituir reglas de entitlement (siguen vía licencias). |
| `services/paddle-commercial-reconcile.service.ts` | `reconcileWorkspace(workspacePublicId)` + `runLightPeriodic(limit)` (stub batch). |
| `jobs/paddle-commercial-reconcile-periodic.stub.ts` | Wrapper para invocar la corrida ligera desde cron/script interno. |

**Elegibilidad:** solo `billingSource === "paddle"` **y** `subscriptionExternalId` presente; **`manual`** → omitido (`paddle_commercial_reconcile_skipped`). Sin **`PADDLE_API_KEY`** → omitido (audita).

**Política conservadora**

| Quién manda | Qué |
|-------------|-----|
| **Paddle (vía esta corrida)** | `billingStatus` comercial salvo invariantes, vínculo `subscriptionExternalId`, agenda **`paddleScheduled*`** (futuro sin subir cupo hoy), períodos/fechas en footprint. |
| **`workspace-licenses`** | `currentEntitledSeats` materializado; si Paddle exige **qty confiable** que viola `seatsAssigned`, la sincronía falla (`SeatCapacityInvariantError`) → auditoría `paddle_commercial_reconcile_license_conflict` (**no** se fuerza downgrade ilegal). |

**Idempotencia:** repetir la corrida es segura: mismos efectos aplican las mismas transiciones; huella API se refresca.

**Divergencias:** falta de vínculo en snapshot → `paddle_commercial_reconcile_divergence_noted` + skip; fallo HTTP Paddle → `paddle_commercial_reconcile_failed`.

**Superficie:** servicio interno + factory `createPaddleCommercialReconcileService` en `billing-seat-enforcement.module.ts` — **sin** endpoint HTTP nuevo para usuarios finales.

### Separación licencias vs Paddle-only programado

- **`currentEntitledSeats`** sigue alineado a **`workspace-licenses.seatsPurchased`** en cada lectura/materialización.
- **`scheduledEntitledSeats`** refleja **`pendingSeatReduction`** interno.
- **`paddleScheduledEntitledSeats` / `paddleScheduledSeatChangeEffectiveAt`** reflejan agenda futura **solo Paddle** sin aumentar entitlement hoy.
- La API pública **`scheduledEntitledFuture`** prioriza reducción interna programada y, si no hay, muestra agenda Paddle-only.

## Modelo lógico (`WorkspaceBillingSnapshot`)

Colección **`WorkspaceBillingSnapshot`**: `currentEntitledSeats`, programación interna + agenda Paddle-only, `billingStatus`, gracia (15 días calendario **v1**), picos internos, `billingSource` (`paddle` | `manual`), `subscriptionExternalId`, etc.

- **Usuario efectivo**: `WorkspaceMember` con `status === "active"` y `hasSeatAssigned === true` (**invitaciones pendientes no cuentan**).

## Estados y política **v1** (cerrada en docs)

- Gracia tras fallo de renovación reconocido: **`grace_period`** con `gracePeriodStartsAt` + `gracePeriodEndsAt` (**+15 días calendario**).
- Tras **`gracePeriodEndsAt`** sin recuperación → **`suspended_non_payment`**.
- Sobrecapacidad: `activeAssignedUsers > currentEntitledSeats` → bloqueo de **expansión** (invites/activaciones).

## Archivos

| Área | Contenido |
|------|-----------|
| `domain/billing-seat-expansion.policy.ts` | Enforcement expansión cupo (invitar con asiento / asignar asiento) |
| `domain/billing-workspace-primary-product.policy.ts` | Rutas exentas + `assertCanUsePrimaryWorkspaceProductFeatures` |
| `domain/billing-workspace-primary-product.errors.ts` | Errores bloqueo producto principal (403 semánticos) |
| `middleware/workspace-billing-primary-product.middleware.ts` | Factory `createWorkspaceBillingPrimaryProductMutationGate` |
| `domain/billing-seat-expansion.errors.ts` | Errores de dominio distinguibles (403) |
| `services/workspace-seat-expansion.gate.ts` | Factory `createWorkspaceSeatExpansionGate` |
| `persistence/` | Prisma `WorkspaceBillingSnapshot`, auditoría, **`PaddleWebhookProcessedEvent`** |
| `services/paddle-subscription-commercial-effects.ts` | Efectos `subscription.*` compartidos webhook + reconciliación |
| `services/paddle-subscription-commercial-fields.ts` | Períodos Paddle + huella `commercialExternalSnapshot` |
| `services/paddle-commercial-reconcile.service.ts` | Reconciliación Paddle ↔ snapshot |
| `services/workspace-billing-state.service.ts` | Lectura, transiciones, reconciliación licencia, footprint API Paddle |
| `services/paddle-webhook-ingestion.service.ts` | Mapeo eventos Paddle → acciones internas |
| `services/paddle-webhook-mapper.ts` | Parsing conservador de payloads |
| `routes/paddle-webhooks.routes.ts` | Webhook firmado |
| `integrations/paddle/fetch-paddle-subscription.ts` | GET suscripción Billing API (JSON `data`). |
| `integrations/paddle/paddle-customer-portal.ts` | Billing API v2: GET subscription → `customer_id`; POST portal-session |
| `services/workspace-billing-portal.service.ts` | Portal URL desde snapshot (`billingSource`, `subscriptionExternalId`) |
| `services/workspace-billing-notification.service.ts` | Correos transaccionales impago/gracia + job últimos 3 días antes del fin de gracia |
| `persistence/schemas/billing-notification-sent.schema.ts` | Dedupe idempotente por `(workspacePublicId, kind, dedupeKey)` |
| `domain/billing-portal.errors.ts` | Errores dominio portal (manual / vínculo / Paddle upstream) |
| `routes/` | HTTP workspace billing (`state`, `portal-session`) |
| `jobs/paddle-billing-webhooks.stub.ts` | Nota histórica / jobs futuros |
| `jobs/paddle-commercial-reconcile-periodic.stub.ts` | Cron ligero opcional (batch interno) |

## Notificaciones de cobro y suspensión (impago)

**Alcance v1:** emails **solo** para transiciones de **impago / gracia / suspensión** (`billingSource !== manual`). **No** mezcla sobrecapacidad ni cupo agotado (siguen en banners/guards).

### Eventos y dedupe

| Kind dedupe (`billing-notification-kind.ts`) | Disparo típico | Dedupe estable (`dedupeKey`) |
|---|---|---|
| `billing_grace_started` | Tras `applyPaymentRenewalFailure` (webhook/reconcile) | `grace_end:<ISO gracePeriodEndsAt>` |
| `billing_suspension_approaching` | Job batch (`runApproachingSuspensionSweep`) en ventana últimos **3 días** antes del fin de gracia | `grace_end:<ISO gracePeriodEndsAt>` |
| `billing_suspended_non_payment` | Escalado `grace→suspend` en `getBillingState` **o** `sweepExpiredGraceSuspensions` | `suspended:<ISO suspensionEffectiveAt \| graceEnds>` |
| `billing_recovered` | Tras `applyPaymentRecovered` contextualizado | `recover:<prior grace ISO \| none>:<from_suspend\|not_from_suspend>` |

Persistencia: colección **`BillingNotificationSent`** (índice único compuesto) — intent `insert`; código **11000** ⇒ ya enviado.

### Destinatarios mail

Miembros **activos** con rol administrativo workspace **`admin` \| `operator`** (`workspaceRoleAdministrative`). No hay mailing masivo al resto del tenant.

### Variables de entorno (`api/.env.example`)

| Variable | Uso |
|----------|-----|
| **`WORKSPACE_APP_PUBLIC_BASE_URL`** | Origen `http(s)://…` del shell workspace (sin path final). `workspaceBillingHubUrl()` arma **`…/app/workspace/billing`** en enlaces de correo. Si no está definida, el texto pide iniciar sesión y abrir Facturación desde el workspace (sin deep link absoluto). Ver `src/config/workspace-app-public-url.ts`. |
| **`BILLING_NOTIFICATION_SWEEP_MS`** | Intervalo en **milisegundos** entre ejecuciones del barrido en `app.ts` (por defecto **21600000** = **6 h**). **`0`** o valor no numérico → **sin** `setInterval` (solo webhooks / escalado en `GET …/billing/state`). |

### Jobs no-interactivos

Cuando el barrido está activo (**`BILLING_NOTIFICATION_SWEEP_MS` > 0**):

1. `WorkspaceBillingStateService.sweepExpiredGraceSuspensions` — materializa suspensión cuando nadie ha llamado `GET billing/state`.
2. `WorkspaceBillingNotificationService.runApproachingSuspensionSweep` — aviso **≤ 3 días** antes del fin de gracia.

### Plantillas de correo (tono y estados)

| Estado cubierto | Plantilla (`workspace-billing-notification-templates.ts`) | Línea de contenido |
|-----------------|-----------------------------------------------------------|--------------------|
| Gracia iniciada | `renderWorkspaceBillingGraceStarted` | Renovación fallida; **referencia de fecha fin de ventana**; Regularización sin mencionar Paddle como marca |
| Suspensión próxima | `renderWorkspaceBillingSuspensionApproaching` | Urgencia medida (últimos días); **misma fecha** como umbral antes de limitación |
| Suspensión efectiva | `renderWorkspaceBillingSuspended` | Acceso principal **limitado**; Facturación/regularización **siguen disponibles** |
| Recuperación | `renderWorkspaceBillingRecovered` | Cobro/situación **regularizada**; retorno al uso habitual |

Las diferencias **Paddle vs canal propio** usan solo el texto del problema/solución (`isPaddleBilling`), sin nombres de proveedor en el asunto.

---

## Superficie admin (Billing operations)

Seguimiento interno por workspace (listado, detalle, auditoría, notificaciones, reconciliación puntual) vive en **`platform-billing-operations`** y **solo lee** este materializado — ver `api/src/modules/platform-billing-operations/README.md` y `contracts-docs/docs/modules/admin-billing-operations/`.

## Limitaciones v1

- Catálogo de plan / desglose “Team 3 + N” usa **heurística** `includedInPlan` ≤ 3 para UI hasta catálogo producto.
- Suma de **`items[].quantity`** como proxy de asientos contratados hasta mapeo **`price_id`** fino.
- Reconciliación programada **robusta** (priorización por antigüedad de `lastCommercialSyncAt`, alertas, reintentos backoff).
- Multi-proveedor, analytics de revenue, cotización enterprise fuera de alcance.

## Postergado

- **In-app** genérico (bandejas unificadas) fuera de los banners **`billing-seat-enforcement`/`workspace-billing`** ya montados.
- Analytics / métricas de entrega email y funnel billing.
- Preferencias granulares por usuario sobre mails billing workspace.
- Emails para escenarios **solo sobrecapacidad** / seat exhaustion (otra fase).
- Jobs nocturnos de coherencia avanzada + alerting divergencias; admin UI divergencias dedicada; multi-provider.
