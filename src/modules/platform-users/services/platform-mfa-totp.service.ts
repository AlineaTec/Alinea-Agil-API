import { authenticator } from "otplib"

authenticator.options = { window: 1 }

export class PlatformMfaTotpService {
  generateSecret(): string {
    return authenticator.generateSecret()
  }

  otpauthUrl(email: string, issuer: string, secretBase32: string): string {
    return authenticator.keyuri(email, issuer, secretBase32)
  }

  verify(secretBase32: string, token: string): boolean {
    return authenticator.verify({ token: token.replace(/\s/g, ""), secret: secretBase32 })
  }
}
