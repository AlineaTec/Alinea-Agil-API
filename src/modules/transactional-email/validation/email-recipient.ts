import { TransactionalEmailInvalidRecipientError } from "../domain/errors.js"

const basicEmail =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function assertValidTransactionalRecipient(to: string): void {
  const e = to.trim()
  if (!e || e.length > 254 || !basicEmail.test(e)) {
    throw new TransactionalEmailInvalidRecipientError("Destinatario de correo inválido.")
  }
}
