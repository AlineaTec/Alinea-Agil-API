import type { WorkspaceMemberState } from "../../workspace-users/domain/workspace-member.js"

function slugifyDisplayHandle(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
}

/**
 * Menciones v1: `@uuid` o un handle derivado del nombre completo / prefijo de email (sin dominio),
 * comparación case-insensitive.
 */
export function parseMentionedUserPublicIdsFromComment(
  body: string,
  members: WorkspaceMemberState[],
  actorUserPublicId: string,
): string[] {
  const mentioned = new Set<string>()
  const uuidRe = /\B@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi
  for (const m of body.matchAll(uuidRe)) {
    const raw = m[1]!
    const mem = members.find((x) => x.userPublicId.toLowerCase() === raw.toLowerCase())
    if (mem && mem.userPublicId !== actorUserPublicId) {
      mentioned.add(mem.userPublicId)
    }
  }

  const bySlug = new Map<string, string>()
  const byLocal = new Map<string, string[]>()
  for (const mem of members) {
    if (mem.userPublicId === actorUserPublicId) continue
    const slug = slugifyDisplayHandle(mem.fullName)
    if (slug.length >= 2) {
      bySlug.set(slug, mem.userPublicId)
    }
    const local = mem.emailNormalized.split("@")[0]!.toLowerCase()
    if (local.length >= 2) {
      const list = byLocal.get(local) ?? []
      list.push(mem.userPublicId)
      byLocal.set(local, list)
    }
  }

  const tokenRe = /\B@([a-z0-9._-]{2,80})\b/gi
  for (const m of body.matchAll(tokenRe)) {
    const token = m[1]!.toLowerCase()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) {
      continue
    }
    const slugHit = bySlug.get(token)
    if (slugHit) {
      mentioned.add(slugHit)
      continue
    }
    const locals = byLocal.get(token)
    if (locals && locals.length === 1) {
      mentioned.add(locals[0]!)
    }
  }

  return [...mentioned]
}
