import assert from "node:assert/strict"
import { describe, it, afterEach } from "node:test"
import { wrapTransactionalHtml } from "./layout.js"

describe("wrapTransactionalHtml (cabecera tipo informe)", () => {
  afterEach(() => {
    delete process.env.TRANSACTIONAL_EMAIL_LOGO_URL
  })

  it("usa franja oscura y wordmark con acento dorado como en PDF", () => {
    const html = wrapTransactionalHtml("<p>cuerpo</p>")
    assert.match(html, /#0a0a0a/)
    assert.match(html, /#c9a227/)
    assert.match(html, /Correo transaccional/)
    assert.match(html, /Producto de AlineaTec/)
    assert.match(html, /https:\/\/agil\.alineatec\.com/)
    assert.match(html, /cuerpo/)
  })

  it("con TRANSACTIONAL_EMAIL_LOGO_URL incluye img", () => {
    process.env.TRANSACTIONAL_EMAIL_LOGO_URL = "https://app.example.com/logo-white.png"
    const html = wrapTransactionalHtml("<p>x</p>")
    assert.match(html, /https:\/\/app\.example\.com\/logo-white\.png/)
    assert.match(html, /<img[^>]+alt=/i)
  })
})
