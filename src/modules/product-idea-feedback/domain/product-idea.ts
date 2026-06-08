/**
 * Catálogo de ideas de producto (consumido por feedback; CRUD editorial completo vive en módulo hermano / admin).
 * @see contracts-docs/docs/modules/product-idea-feedback/module-overview.md
 */
export const productIdeaStatuses = ["draft", "published", "archived", "internal"] as const
export type ProductIdeaStatus = (typeof productIdeaStatuses)[number]

export type ProductIdea = {
  ideaPublicId: string
  title: string
  summary: string
  description: string | null
  /** Taxonomía de producto (p. ej. reporting, scrum). */
  area: string
  status: ProductIdeaStatus
  isFeedbackEnabled: boolean
  createdAt: Date
  updatedAt: Date
}
