import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isCommercialRegistrationAllowedForConfig,
  type PaymentGatewayConfig,
} from "./payment-gateway-policy.js"

function cfg(partial: Partial<PaymentGatewayConfig>): PaymentGatewayConfig {
  return {
    env: "development",
    provider: "paddle",
    mode: "disabled",
    status: "inactive",
    ...partial,
  }
}

describe("payment-gateway-policy (registro comercial)", () => {
  it("permite development con cualquier modo", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "development", mode: "live", status: "pending_approval" }),
      ),
      true,
    )
  })

  it("permite demo", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "demo", mode: "live", status: "inactive" }),
      ),
      true,
    )
  })

  it("permite production con mock o disabled", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "mock", status: "inactive" }),
      ),
      true,
    )
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "disabled", status: "paused" }),
      ),
      true,
    )
  })

  it("permite production live + active", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "live", status: "active" }),
      ),
      true,
    )
  })

  it("bloquea production live + pending_approval", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "live", status: "pending_approval" }),
      ),
      false,
    )
  })

  it("bloquea production live + paused o inactive", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "live", status: "paused" }),
      ),
      false,
    )
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "live", status: "inactive" }),
      ),
      false,
    )
  })

  it("permite production sandbox + active (staging Paddle)", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "sandbox", status: "active" }),
      ),
      true,
    )
  })

  it("bloquea production sandbox + inactive", () => {
    assert.equal(
      isCommercialRegistrationAllowedForConfig(
        cfg({ env: "production", mode: "sandbox", status: "inactive" }),
      ),
      false,
    )
  })
})

