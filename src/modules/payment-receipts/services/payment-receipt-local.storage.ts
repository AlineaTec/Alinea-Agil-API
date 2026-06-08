import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export class PaymentReceiptLocalFileStorage {
  constructor(private readonly rootDir: string) {}

  private fullPath(storageKey: string): string {
    const safe = storageKey.replace(/\.\./g, "").replace(/^\/+/, "")
    return path.join(this.rootDir, safe)
  }

  async writeBuffer(storageKey: string, data: Buffer): Promise<void> {
    const fp = this.fullPath(storageKey)
    await mkdir(path.dirname(fp), { recursive: true })
    await writeFile(fp, data)
  }

  async readBuffer(storageKey: string): Promise<Buffer | null> {
    try {
      const fp = this.fullPath(storageKey)
      return await readFile(fp)
    } catch {
      return null
    }
  }
}

export function getPaymentReceiptStorageRoot(): string {
  const raw = process.env.PAYMENT_RECEIPT_STORAGE_DIR?.trim()
  if (raw && raw.length > 0) return path.resolve(raw)
  return path.join(process.cwd(), "var", "payment-receipts")
}
