import type { ScrumBacklogItemState } from "../../../modules/project-scrum-backlog/domain/scrum-backlog-item.js"
import { DEMO, kanbanItemPublicId, scrumStoryPublicId } from "./ids-demo.js"

export type RichKanbanItemSpec = {
  publicId: string
  title: string
  description: string
  sortOrder: number
  columnPublicId: string
  storyPoints: number
  priorityLevel: ScrumBacklogItemState["priorityLevel"]
  assigneeIndex: number | null
  isBlocked?: boolean
  blockedReason?: string | null
}

export type RichScrumStorySpec = {
  publicId: string
  title: string
  description: string
  points: number
  priorityLevel: ScrumBacklogItemState["priorityLevel"]
  assigneeIndex: number | null
  status?: ScrumBacklogItemState["status"]
}

export const ACME_KANBAN_ITEMS: RichKanbanItemSpec[] = [
  {
    publicId: kanbanItemPublicId(1),
    title: "Recuperación de carritos abandonados",
    description:
      "Automatizar email + push cuando el carrito lleva >2h sin checkout. Meta: +8% conversión en tienda online ACME.",
    sortOrder: 1,
    columnPublicId: DEMO.kanbanColReady,
    storyPoints: 5,
    priorityLevel: "high",
    assigneeIndex: 3,
  },
  {
    publicId: kanbanItemPublicId(2),
    title: "Integración Apple Pay y Yape",
    description: "Checkout unificado Perú: tokenización y conciliación con ERP legacy.",
    sortOrder: 2,
    columnPublicId: DEMO.kanbanColProgress,
    storyPoints: 8,
    priorityLevel: "urgent",
    assigneeIndex: 4,
    isBlocked: true,
    blockedReason: "Esperando certificación del proveedor de pagos",
  },
  {
    publicId: kanbanItemPublicId(3),
    title: "Optimizar LCP en listado de productos",
    description: "Reducir LCP <2.5s en PLP móvil mediante lazy-load de imágenes AVIF.",
    sortOrder: 3,
    columnPublicId: DEMO.kanbanColReady,
    storyPoints: 3,
    priorityLevel: "medium",
    assigneeIndex: 5,
  },
  {
    publicId: kanbanItemPublicId(4),
    title: "Alertas de stock en tienda física",
    description: "Notificar a encargados cuando SKU cae bajo mínimo en sucursal Lima Centro.",
    sortOrder: 4,
    columnPublicId: DEMO.kanbanColProgress,
    storyPoints: 5,
    priorityLevel: "high",
    assigneeIndex: 6,
  },
  {
    publicId: kanbanItemPublicId(5),
    title: "Panel B2B para distribuidores",
    description: "Vista de pedidos mayoristas, crédito disponible y SLA de despacho.",
    sortOrder: 5,
    columnPublicId: DEMO.kanbanColProgress,
    storyPoints: 13,
    priorityLevel: "high",
    assigneeIndex: 2,
  },
  {
    publicId: kanbanItemPublicId(6),
    title: "Sincronización inventario regional",
    description: "Job nocturno entre WMS Arequipa y catálogo central con cola de reintentos.",
    sortOrder: 6,
    columnPublicId: DEMO.kanbanColProgress,
    storyPoints: 8,
    priorityLevel: "medium",
    assigneeIndex: 7,
  },
  {
    publicId: kanbanItemPublicId(7),
    title: "Suite E2E checkout crítico",
    description: "Playwright: happy path, cupón, stock agotado y timeout de pasarela.",
    sortOrder: 7,
    columnPublicId: DEMO.kanbanColReview,
    storyPoints: 5,
    priorityLevel: "high",
    assigneeIndex: 8,
  },
  {
    publicId: kanbanItemPublicId(8),
    title: "Documentar API fulfillment",
    description: "OpenAPI 3.1 + ejemplos Postman para partners logísticos.",
    sortOrder: 8,
    columnPublicId: DEMO.kanbanColReview,
    storyPoints: 2,
    priorityLevel: "low",
    assigneeIndex: 9,
  },
  {
    publicId: kanbanItemPublicId(9),
    title: "Rediseño mini-cart",
    description: "UX mobile-first con resumen de envío y promociones aplicables.",
    sortOrder: 9,
    columnPublicId: DEMO.kanbanColReview,
    storyPoints: 5,
    priorityLevel: "medium",
    assigneeIndex: 3,
  },
  {
    publicId: kanbanItemPublicId(10),
    title: "Impuestos internacionales (Chile)",
    description: "Motor de tasas para exportación retail; validación con contabilidad.",
    sortOrder: 10,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 8,
    priorityLevel: "medium",
    assigneeIndex: 4,
  },
  {
    publicId: kanbanItemPublicId(11),
    title: "Dashboard funnel conversión",
    description: "Embudo visita → carrito → pago con segmentación por canal.",
    sortOrder: 11,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 5,
    priorityLevel: "medium",
    assigneeIndex: 5,
  },
  {
    publicId: kanbanItemPublicId(12),
    title: "Onboarding vendedores tienda",
    description: "Tour guiado + checklist primer día para fuerza de ventas.",
    sortOrder: 12,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 3,
    priorityLevel: "low",
    assigneeIndex: 6,
  },
  {
    publicId: kanbanItemPublicId(13),
    title: "Widget recomendaciones ML",
    description: "Bloque «También te puede interesar» con modelo v2 en home y PDP.",
    sortOrder: 13,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 8,
    priorityLevel: "high",
    assigneeIndex: 2,
  },
  {
    publicId: kanbanItemPublicId(14),
    title: "Migración CDN imágenes",
    description: "Cutover a CDN regional con invalidación por colección.",
    sortOrder: 14,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 5,
    priorityLevel: "medium",
    assigneeIndex: 7,
  },
  {
    publicId: kanbanItemPublicId(15),
    title: "Devoluciones express en tienda",
    description: "Flujo QR en POS para devolución sin ticket físico.",
    sortOrder: 15,
    columnPublicId: DEMO.kanbanColDone,
    storyPoints: 5,
    priorityLevel: "medium",
    assigneeIndex: 8,
  },
]

export const ACME_SCRUM_STORIES: RichScrumStorySpec[] = [
  {
    publicId: scrumStoryPublicId(1),
    title: "Registro con OTP SMS",
    description: "Alta de cliente con verificación móvil y consentimiento LPDP.",
    points: 8,
    priorityLevel: "urgent",
    assigneeIndex: 4,
    status: "in_progress",
  },
  {
    publicId: scrumStoryPublicId(2),
    title: "Catálogo de recompensas",
    description: "CRUD de premios, stock y reglas de canje por tier.",
    points: 5,
    priorityLevel: "high",
    assigneeIndex: 5,
    status: "in_progress",
  },
  {
    publicId: scrumStoryPublicId(3),
    title: "Acumulación de puntos por compra",
    description: "Listener de órdenes pagadas → puntos con redondeo y topes diarios.",
    points: 8,
    priorityLevel: "high",
    assigneeIndex: 6,
  },
  {
    publicId: scrumStoryPublicId(4),
    title: "Historial de movimientos",
    description: "Timeline de puntos ganados/canjeados con filtros por fecha.",
    points: 3,
    priorityLevel: "medium",
    assigneeIndex: 7,
  },
  {
    publicId: scrumStoryPublicId(5),
    title: "Notificaciones push de hitos",
    description: "Push al subir de nivel o vencer puntos en 7 días.",
    points: 5,
    priorityLevel: "medium",
    assigneeIndex: 8,
    status: "done",
  },
  {
    publicId: scrumStoryPublicId(6),
    title: "Canje en checkout",
    description: "Aplicar puntos como descuento parcial con validación antifraude.",
    points: 8,
    priorityLevel: "urgent",
    assigneeIndex: 4,
    status: "in_progress",
  },
  {
    publicId: scrumStoryPublicId(7),
    title: "Perfil de membresía",
    description: "Avatar, tier actual, beneficios y próximo hito.",
    points: 3,
    priorityLevel: "medium",
    assigneeIndex: 5,
  },
  {
    publicId: scrumStoryPublicId(8),
    title: "Referidos «trae un amigo»",
    description: "Código único, tracking y bonificación dual.",
    points: 5,
    priorityLevel: "high",
    assigneeIndex: 6,
  },
  {
    publicId: scrumStoryPublicId(9),
    title: "Dashboard analítica retención",
    description: "Cohortes D7/D30 y tasa de canje para producto.",
    points: 8,
    priorityLevel: "medium",
    assigneeIndex: 2,
  },
  {
    publicId: scrumStoryPublicId(10),
    title: "Sincronización CRM Salesforce",
    description: "Bidireccional de tier y última compra cada 15 min.",
    points: 5,
    priorityLevel: "low",
    assigneeIndex: 7,
  },
  {
    publicId: scrumStoryPublicId(11),
    title: "Modo offline en tienda",
    description: "Cache de saldo de puntos para POS sin red.",
    points: 8,
    priorityLevel: "high",
    assigneeIndex: 8,
  },
  {
    publicId: scrumStoryPublicId(12),
    title: "A/B test pantalla de bienvenida",
    description: "Experimentación en onboarding con métricas de activación.",
    points: 3,
    priorityLevel: "low",
    assigneeIndex: 3,
  },
  {
    publicId: scrumStoryPublicId(13),
    title: "Exportación reportes CSV",
    description: "Descarga filtrada para marketing y finanzas.",
    points: 2,
    priorityLevel: "low",
    assigneeIndex: 9,
  },
  {
    publicId: scrumStoryPublicId(14),
    title: "Accesibilidad WCAG AA",
    description: "Contraste, foco y lectores de pantalla en flujos clave.",
    points: 5,
    priorityLevel: "medium",
    assigneeIndex: 10,
  },
]

export const ACME_DEMO_USER_NAMES: Record<number, string> = {
  1: "Usuario Pruebas",
  2: "Luis Ortega",
  3: "María Salinas",
  4: "Carlos Mendoza",
  5: "Elena Ríos",
  6: "Diego Paredes",
  7: "Sofía Campos",
  8: "Andrés Vela",
  9: "Patricia Núñez",
  10: "Ricardo Fuentes",
  11: "Gabriela Solís",
  12: "Jorge Altamirano",
}
