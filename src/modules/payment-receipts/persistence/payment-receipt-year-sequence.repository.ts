export interface PaymentReceiptYearSequenceRepository {
  nextForYear(year: number): Promise<number>
}
