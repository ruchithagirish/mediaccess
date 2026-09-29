export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  subtotalPaise: number;
  totalPaise: number;
  status: "ISSUED" | "DISCOUNT_PENDING" | "VOID";
  discountPaise: number;
  taxPaise: number;
  paidPaise: number;
  outstandingPaise: number;
  patient: { id: string; name: string; email: string; phone: string | null; mrn: string };
  treatment: { summary: string; completedAt: string } | null;
  supplier: { name: string; legalName: string | null; gstin: string | null; stateCode: string | null; billingAddress: string | null };
  placeOfSupplyStateCode: string | null;
  appointment: { date: string; startTime: string; doctor: string };
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
    hsnSacCode: string | null;
    taxTreatment: "EXEMPT" | "TAXABLE";
    gstRateBps: number;
    discountPaise: number;
    taxablePaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
  }[];
  payments: { id: string; mode: string; amountPaise: number; reference: string | null; receivedAt: string }[];
}