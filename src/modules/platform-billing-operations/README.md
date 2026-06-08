# Platform Billing Operations

Superficie **solo administrativa** para seguimiento comercial/operativo por workspace. **No** redefine el modelo de estado de billing: consume datos ya materializados en `billing-seat-enforcement` (snapshot, auditoría, notificaciones enviadas, reconciliación Paddle).

## Responsabilidades

- Listado y detalle para roles de plataforma (`platform_super_admin`, `platform_operator`, `platform_auditor` en lectura).
- Filtros y columnas orientadas a soporte (estado, origen, sobrecapacidad, divergencias/atención, búsqueda por workspace).
- Detalle con snapshot interno, huella comercial resumida, eventos de auditoría recientes y notificaciones enviadas.
- Acción opcional `POST .../reconcile` delegada en `PaddleCommercialReconcileService` (operadores/super admin; auditores bloqueados).

## Documentación de contrato

Ver `contracts-docs/docs/modules/admin-billing-operations/`.

## Postergado (explícito)

- Edición manual compleja del snapshot desde admin.
- Dashboards ejecutivos o analytics de revenue.
- Multi-proveedor de billing.
- Reconciliación masiva o tooling interno avanzado.
