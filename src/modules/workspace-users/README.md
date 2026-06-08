# `workspace-users` (API)

Miembros del workspace, asientos y roles — alineado a `contracts-docs` sobre **`WorkspaceMember`** + `workspace-licenses`.

## Billing / expansión de cupo (**v1**)

Las mutaciones que **consumen un asiento nuevo** para un usuario efectivo (`status === active` y `hasSeatAssigned`) están protegidas por **`billing-seat-enforcement`**:

- **`POST /v1/workspaces/:workspacePublicId/members`** con **`assignSeat: true`**
- **`POST …/members/:membershipPublicId/assign-seat`**

Si la política materializada en `WorkspaceBillingStateService.getBillingState` bloquea la expansión (sobrecapacidad, cupo agotado, suspensión por impago, estado comercial terminal), el API responde **403** con cuerpo `{ error, message, expansionBlockedReason }` — ver `BillingSeatExpansionBlockedError` en `billing-seat-enforcement`.

**No** se aplica gate a: crear miembro sin asiento, activar a `active_without_seat`, desactivar, liberar asiento, cambiar roles, ni lecturas.

**Contratar más capacidad** (`workspace-licenses`, checkout/webhooks) no usa este gate; es la vía de regularización.

El bloqueo del **uso principal del producto** cuando `suspended_non_payment` (fuera de expansión) es responsabilidad de otros módulos/guards según `billing-guards.policy`; esta fase cubre **expansión de miembros con asiento**.
