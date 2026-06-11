# Commercial pricing (API)

Fuente de verdad para precios en **USD**, alineada al catálogo Web/Landing (`alinea-plan-catalog.ts`).

## Modelo vigente (tiers)

| Tier | Precio/licencia/mes | Mín. licencias | Usuarios | Proyectos activos |
|------|---------------------|----------------|----------|-------------------|
| **Gratis** | $0 | — | 5 | 5 |
| **Equipo** | $6 | 1 | según licencias | ilimitados |
| **Pro** | $12 | 1 | según licencias | ilimitados |

## Modelo Paddle legado (suscripciones históricas)

| Concepto | Lista mensual (USD) |
|----------|---------------------|
| **Individual** | 12 (1 usuario) |
| **Team base** | 45 (incluye 3 usuarios) |
| **Seat adicional** | 15 por usuario por encima de 3 |

Toda facturación nueva es **mensual** (sin opción anual).

## Paddle — variables de entorno (price ids)

**Modelo tier (recomendado):** las **2** variables `PADDLE_PRICE_*_LICENSE_MONTHLY` → checkout y webhooks con `qty = licencias`.

| Variable | Rol |
|----------|-----|
| `PADDLE_PRICE_TEAM_LICENSE_MONTHLY` | Equipo $6/licencia mensual |
| `PADDLE_PRICE_PRO_LICENSE_MONTHLY` | Pro $12/licencia mensual |

**Modelo legado:** las **3** variables mensuales base+addon (mín. 3 asientos). Si falta el catálogo tier y alguna legado, el API usa suma legacy de `quantity`.

| Variable | Rol |
|----------|-----|
| `PADDLE_PRICE_INDIVIDUAL_MONTHLY` | Individual mensual |
| `PADDLE_PRICE_TEAM_BASE_MONTHLY` | Team base mensual |
| `PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY` | Seat adicional mensual |

## Uso en código

- `computeCommercialQuote()` — cotización (base + addon en Team).
- `buildPaddleSubscriptionCheckoutLines()` — líneas conceptuales para checkout mensual.
- `deriveCommercialSeatEntitlementFromPaddleItems()` — Paddle items → `entitledSeats` (usado por billing-seat-enforcement).
- `computeManagedWorkspaceCommercial()` — mismo modelo para admin / reportes.
- `seatsForNewWorkspaceFromIntent()` — asientos iniciales al provisionar.

## Frontend (`/web`)

Catálogo público: `GET /v1/public/registration/commercial-catalog` incluye `teamBaseMonthlyUsd`, `additionalSeatMonthlyUsd`, `teamIncludedSeats` y campos legados.
