import nodemailer from "nodemailer";

function configuredEmail() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" } } : {}),
  });
  return { from, transporter };
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

async function sendWhatsAppTemplate(phone: string, templateName: string, parameters: string[]) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new Error("WhatsApp is not configured.");
  const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_APPOINTMENT_LANGUAGE ?? "en" },
        components: [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }],
      },
    }),
  });
  if (!response.ok) throw new Error(`WhatsApp delivery failed (${response.status}).`);
}

async function sendSms(phone: string, templateId: string, parameters: Record<string, string>) {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) throw new Error("SMS is not configured.");
  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: { authkey: authKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: templateId,
      recipients: [{ mobiles: normalizePhone(phone), ...parameters }],
    }),
  });
  if (!response.ok) throw new Error(`SMS delivery failed (${response.status}).`);
}

async function attemptDeliveries(tasks: Promise<unknown>[]) {
  const results = await Promise.allSettled(tasks);
  if (!results.some((result) => result.status === "fulfilled")) {
    throw new Error("No appointment notification channel accepted the message.");
  }
  for (const result of results) {
    if (result.status === "rejected") console.error("public booking notification failed", result.reason);
  }
}

export async function sendPublicBookingOtp(input: { name: string; phone: string; email: string; code: string }) {
  const phoneTasks: Promise<unknown>[] = [];
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID) {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", process.env.MSG91_OTP_TEMPLATE_ID);
    url.searchParams.set("mobile", normalizePhone(input.phone));
    url.searchParams.set("otp", input.code);
    phoneTasks.push(fetch(url, { headers: { authkey: process.env.MSG91_AUTH_KEY } }).then((response) => {
      if (!response.ok) throw new Error(`SMS OTP delivery failed (${response.status}).`);
    }));
  }
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_OTP_TEMPLATE) {
    phoneTasks.push(sendWhatsAppTemplate(input.phone, process.env.WHATSAPP_OTP_TEMPLATE, [input.code]));
  }
  if (!phoneTasks.length) throw new Error("No phone verification channel is configured.");
  await attemptDeliveries(phoneTasks);

  const email = configuredEmail();
  if (email) {
    void email.transporter.sendMail({
      from: email.from,
      to: input.email,
      subject: "Verify your MediAccess appointment",
      text: `Hello ${input.name}, your MediAccess verification code is ${input.code}. It expires in 10 minutes.`,
    }).catch((error: unknown) => console.error("booking OTP email copy failed", error));
  }
}

export async function sendAppointmentConfirmation(input: {
  name: string;
  phone: string;
  email: string;
  doctor: string;
  date: string;
  time: string;
}) {
  const tasks: Promise<unknown>[] = [];
  const email = configuredEmail();
  if (email) tasks.push(email.transporter.sendMail({
    from: email.from,
    to: input.email,
    subject: "MediAccess appointment confirmed",
    text: `Hello ${input.name}, your appointment with ${input.doctor} is confirmed for ${input.date} at ${input.time}.`,
  }));
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_APPOINTMENT_TEMPLATE_ID) {
    tasks.push(sendSms(input.phone, process.env.MSG91_APPOINTMENT_TEMPLATE_ID, {
      var1: input.name,
      var2: input.doctor,
      var3: input.date,
      var4: input.time,
    }));
  }
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_APPOINTMENT_TEMPLATE) {
    tasks.push(sendWhatsAppTemplate(input.phone, process.env.WHATSAPP_APPOINTMENT_TEMPLATE, [
      input.name, input.doctor, input.date, input.time,
    ]));
  }
  if (!tasks.length) return;
  try {
    await attemptDeliveries(tasks);
  } catch (error) {
    console.error("appointment confirmation could not be delivered", error);
  }
}