import type { SeatInvoiceKind } from '@prisma/client';
import type { EmailMessage } from '../notifications/email.service';

export interface OverdueSeatInvoice {
  groupName: string;
  kind: SeatInvoiceKind;
  seats: number | null;
  unitPriceCents: number;
  amountCents: number;
  dueDate: string | null;
  graceDaysLeft: number | null;
  payUrl: string | null;
  panelUrl: string;
}

export function seatInvoiceOverdueEmail(_f: OverdueSeatInvoice): Omit<EmailMessage, 'to'> {
  throw new Error('não implementado');
}
