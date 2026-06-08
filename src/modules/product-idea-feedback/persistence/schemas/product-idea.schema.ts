import type { ProductIdeaStatus } from "../../domain/product-idea.js"

export interface ProductIdeaDocProps {
  ideaPublicId: string
  title: string
  summary: string
  description: string | null
  area: string
  status: ProductIdeaStatus
  isFeedbackEnabled: boolean
}
