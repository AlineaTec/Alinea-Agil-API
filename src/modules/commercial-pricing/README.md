# Commercial pricing (API)

Fuente de verdad para precios en **USD** alineados a `contracts-docs` **billing-seat-enforcement** (catálogo Team base + Additional Seat, descuento anual 10%).

## Modelo v1

| Concepto | Lista mensual (USD) |
|----------|---------------------|
| **Individual** | 12 (1 usuario) |
| **Team base** | 45 (incluye 3 usuarios) |
| **Seat adicional** | 15 por usuario por encima de 3 |

**Anual:** descuento **10%** sobre el subtotal del periodo (= 12× la lista mensual del SKUs efectivos). Parametrizable con `COMMERCIAL_ANNUAL_DISCOUNT_RATE` hasta `ANNUAL_DISCOUNT_RATE_CAP` (0.2).

## Paddle — variables de entorno (price ids)

Obligatorias las **6** para que webhooks/reconciliación usen semántica estricta (`deriveCommercialSeatEntitlementFromPaddleItems`). Si falta alguna, el API entra en **modo legacy** (suma de `quantity` en ítems, sin interpretar roles).

| Variable | Rol |
|----------|-----|
| `PADDLE_PRICE_INDIVIDUAL_MONTHLY` | Individual mensual |
| `PADDLE_PRICE_INDIVIDUAL_ANNUAL` | Individual anual |
| `PADDLE_PRICE_TEAM_BASE_MONTHLY` | Team Base mensual |
| `PADDLE_PRICE_TEAM_BASE_ANNUAL` | Team Base anual |
| `PADDLE_PRICE_ADDITIONAL_SEAT_MONTHLY` | Additional Seat mensual |
| `PADDLE_PRICE_ADDITIONAL_SEAT_ANNUAL` | Additional Seat anual |

## Variables de entorno (descuento)

| Variable | Descripción |
|----------|-------------|
| `COMMERCIAL_ANNUAL_DISCOUNT_RATE` | Opcional. Decimal `0`–`0.2`. Si se omite, se usa **10%** (`ANNUAL_DISCOUNT_RATE_DEFAULT`). |

## Uso en código

- `computeCommercialQuote()` — cotización (base + addon en Team).
- `buildPaddleSubscriptionCheckoutLines()` — líneas conceptuales para checkout (mismo intervalo en todos los ítems).
- `deriveCommercialSeatEntitlementFromPaddleItems()` — Paddle items → `entitledSeats` (usado por billing-seat-enforcement).
- `computeManagedWorkspaceCommercial()` — mismo modelo para admin / reportes.
- `seatsForNewWorkspaceFromIntent()` — asientos iniciales al provisionar.
- `getAnnualDiscountRate()` — tasa efectiva del descuento anual.

## Frontend (`/web`)

Catálogo público: `GET /v1/public/registration/commercial-catalog` incluye `teamBaseMonthlyUsd`, `additionalSeatMonthlyUsd`, `teamIncludedSeats` y campos legados.
