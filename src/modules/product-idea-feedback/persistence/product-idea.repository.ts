import type { ProductIdea } from "../domain/product-idea.js"

export type ProductIdeaListFilter = {
  status?: ProductIdea["status"]
  /** If set, only ideas with this value for `isFeedbackEnabled`. */
  isFeedbackEnabled?: boolean
  limit: number
  offset: number
}

export type ProductIdeaPatch = Partial<
  Pick<ProductIdea, "title" | "summary" | "description" | "area" | "status" | "isFeedbackEnabled">
>

export interface ProductIdeaRepository {
  findByPublicId(ideaPublicId: string): Promise<ProductIdea | null>
  list(filter: ProductIdeaListFilter): Promise<ProductIdea[]>
  countList(filter: Omit<ProductIdeaListFilter, "limit" | "offset">): Promise<number>
  insert(idea: ProductIdea): Promise<void>
  updateByPublicId(ideaPublicId: string, patch: ProductIdeaPatch): Promise<ProductIdea | null>
}
