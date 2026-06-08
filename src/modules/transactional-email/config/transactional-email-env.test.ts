import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { normalizePublicHttpUrl } from "./transactional-email-env.js"

describe("transactional-email-env", () => {
  it("normalizePublicHttpUrl recorta slash final y rechaza sin esquema", () => {
    assert.equal(normalizePublicHttpUrl("https://admin.example.com/"), "https://admin.example.com")
    assert.equal(
      normalizePublicHttpUrl("https://admin.example.com/app/"),
      "https://admin.example.com/app",
    )
    assert.equal(normalizePublicHttpUrl("admin.example.com"), null)
    assert.equal(normalizePublicHttpUrl("ftp://x"), null)
    assert.equal(normalizePublicHttpUrl(""), null)
  })
})
