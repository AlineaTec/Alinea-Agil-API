import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolvePaddleRestApiOriginFromEnv } from "./paddle-api-base.js"

describe("resolvePaddleRestApiOriginFromEnv", () => {
  it("sandbox_* fuerza sandbox-api aunque el modo configurado sea live", () => {
    assert.equal(
      resolvePaddleRestApiOriginFromEnv({ PADDLE_API_KEY: "sandbox_xxxxx" }, "live"),
      "https://sandbox-api.paddle.com",
    )
  })

  it("live_* fuerza api.paddle.com aunque el modo configurado sea sandbox", () => {
    assert.equal(
      resolvePaddleRestApiOriginFromEnv({ PADDLE_API_KEY: "live_xxxxx" }, "sandbox"),
      "https://api.paddle.com",
    )
  })

  it("pdl_sdbx_apikey_* fuerza sandbox-api (formato Billing unificado)", () => {
    assert.equal(
      resolvePaddleRestApiOriginFromEnv(
        { PADDLE_API_KEY: "pdl_sdbx_apikey_01kqatest" },
        "live",
      ),
      "https://sandbox-api.paddle.com",
    )
  })

  it("pdl_live_apikey_* fuerza api.paddle.com", () => {
    assert.equal(
      resolvePaddleRestApiOriginFromEnv(
        { PADDLE_API_KEY: "pdl_live_apikey_01kqatest" },
        "sandbox",
      ),
      "https://api.paddle.com",
    )
  })

  it("sin prefijo conocido usa el modo configurado", () => {
    assert.equal(resolvePaddleRestApiOriginFromEnv({}, "live"), "https://api.paddle.com")
    assert.equal(resolvePaddleRestApiOriginFromEnv({}, "sandbox"), "https://sandbox-api.paddle.com")
  })
})
