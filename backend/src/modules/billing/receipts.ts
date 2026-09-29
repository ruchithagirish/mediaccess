import nodemailer from "nodemailer";
import { ReceiptChannel, ReceiptStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";

function normalizeWhatsAppNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

async function deliverEmail(destination: string, invoiceNumber: string, amountPaise: number, patientName: string) {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) throw new Error("Email receipt delivery is not configured.");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } } : {}),
  });
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amountPaise / 100);
  await transporter.sendMail({
    from,
    to: destination,
    subject: `Payment receipt · ${invoiceNumber}`,
    text: `Hello ${patientName},\n\nWe received ${amount} for invoice ${invoiceNumber}. Thank you.`,
  });
  return undefined;
}

async function deliverWhatsApp(destination: string, invoiceNumber: string, amountPaise: number, patientName: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp receipt delivery is not configured.");
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  const template = process.env.WHATSAPP_RECEIPT_TEMPLATE ?? "payment_receipt";
  const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amountPaise / 100);
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsAppNumber(destination),
      type: "template",
      template: {
        name: template,
        language: { code: process.env.WHATSAPP_RECEIPT_LANGUAGE ?? "en" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: patientName },
            { type: "text", text: invoiceNumber },
            { type: "text", text: amount },
          ],
        }],
      },
    }),
  });
  const result = await response.json() as { messages?: { id?: string }[]; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "WhatsApp receipt delivery failed.");
  return result.messages?.[0]?.id;
}

export async function deliverPaymentReceipts(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      invoice: {
        include: {
          patient: { include: { user: { select: { name: true, email: true, phone: true } } } },
        },
      },
    },
  });
  if (!payment) return;
  const { patient } = payment.invoice;
  const targets: { channel: ReceiptChannel; destination: string }[] = [];
  if (patient.user.email) targets.push({ channel: ReceiptChannel.EMAIL, destination: patient.user.email });
  if (patient.user.phone) targets.push({ channel: ReceiptChannel.WHATSAPP, destination: patient.user.phone });

  await Promise.all(targets.map(async ({ channel, destination }) => {
    const existing = await prisma.receiptDelivery.findUnique({ where: { paymentId_channel: { paymentId, channel } } });
    if (existing?.status === ReceiptStatus.SENT) return;
    const delivery = await prisma.receiptDelivery.upsert({
      where: { paymentId_channel: { paymentId, channel } },
      create: { paymentId, channel, destination, status: ReceiptStatus.PENDING, attempts: 1 },
      update: { destination, status: ReceiptStatus.PENDING, attempts: { increment: 1 }, lastError: null },
    });
    try {
      const providerMessageId = channel === ReceiptChannel.EMAIL
        ? await deliverEmail(destination, payment.invoice.invoiceNumber, payment.amountPaise, patient.user.name)
        : await deliverWhatsApp(destination, payment.invoice.invoiceNumber, payment.amountPaise, patient.user.name);
      await prisma.receiptDelivery.update({
        where: { id: delivery.id },
        data: { status: ReceiptStatus.SENT, providerMessageId, sentAt: new Date(), lastError: null },
      });
    } catch (error) {
      await prisma.receiptDelivery.update({
        where: { id: delivery.id },
        data: { status: ReceiptStatus.FAILED, lastError: error instanceof Error ? error.message.slice(0, 500) : "Delivery failed." },
      });
    }
  }));
}