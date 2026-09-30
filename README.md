# MediAccess — Public Website + HMS (auth + role dashboards)

Implements these workflows from the Master Specification:

- **Public website** (Next.js): home, patient **register / login**, patient portal, doctor discovery and appointment booking.
- **HMS**: separate **staff register / login** (multi-select roles, admin approval), and **7 role dashboards**:
  admin, receptionist, doctor, nurse, pharmacist, lab technician, accountant.
- **Appointments**: tenant-scoped specialties, doctor schedules, available slots, booking, rescheduling, soft cancellation, and reception check-in tokens.
- **Reception**: patient intake with MRN/ABHA capture, duplicate checks, walk-ins, tokenized live OPD queue, and doctor consultation entry.
- **Billing and payments**: service/procedure rate cards, GST-aware invoices, discount approvals, counter reconciliation, multi-mode payment capture, and patient PDF receipts.
- **Prescriptions and investigations**: generic/brand formulary, schedule classifications, rules-based allergy/interaction checks, signed e-prescriptions, department worklists, S3 report uploads, and report/critical notifications.
- Password **show/hide** toggle on every password field.
- **API** (Express + Prisma + PostgreSQL): JWT access token (15 min) + rotating refresh token (7 days, reuse detection),
  server-side RBAC, tenant resolution, audit log, rate-limited auth endpoints.

```
mediaccess/
├── backend/               Express + TypeScript + Prisma
│   ├── src/modules/       Domain routes and services
│   ├── src/middleware/    auth, rbac, tenant, audit, errorHandler
│   ├── src/jobs/          Placeholder for future BullMQ workers
│   └── prisma/            Schema, migrations, and seed
├── web/                   Next.js 16 (App Router)
│   ├── app/(public)/      Marketing, discovery, and education
│   ├── app/(hms)/         Staff login and HMS console
│   ├── app/(patient)/     Patient portal
│   └── components/        Domain-grouped React components
├── mobile/                Flutter patient-app placeholder
├── ai-service/            FastAPI placeholder
├── shared/                TypeScript contract placeholders
├── cms/                   Sanity Studio
└── infra/                 Docker Compose, Terraform, and CI placeholders
```

## Run it

Requires Node 20.9+ and Docker.

```bash
# 1. database
docker compose -f infra/docker-compose.yml up -d

# 2. backend
cd backend
cp .env.example .env            # set JWT_ACCESS_SECRET (32+ random chars)
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev                     # http://localhost:4000

# 3. web (new terminal)
cd web
cp .env.local.example .env.local   # adjust NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                     # http://localhost:3000

# 4. CMS (new terminal; set the same Sanity project and dataset as the web app)
cd cms
cp .env.example .env
npm install
npm run dev                     # Sanity Studio
```

## Public website CMS

- Create a Sanity project and set `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` in `web/.env.local`; set `SANITY_STUDIO_PROJECT_ID` and `SANITY_STUDIO_DATASET` in `cms/.env`. The public frontend queries only published documents and uses 60-second ISR revalidation.
- Start `cms/` with `npm run dev` and sign in with a Sanity editor account. The Studio manages homepage copy, specialties, doctor profiles, services, health articles, and patient courses.
- A doctor profile must reference the active HMS `DoctorProfile` ID in **HMS doctor ID** and one or more published specialties to appear in discovery. Languages, gender, experience, and focus are editorial filters/details; live bookability and available slots are always checked against the appointment API.
- Set `publishedAt` to publish content. Updates appear on the website within 60 seconds. Use Sanity's normal editor roles to grant marketing staff content access without access to the HMS database.

## Demo accounts (from the seed)

| Who | Login | Password |
|---|---|---|
| Admin | admin@mediaccess.in | Admin@123 |
| Receptionist | reception@mediaccess.in | Demo@1234 |
| Doctor | doctor@mediaccess.in | Demo@1234 |
| Doctor (Neurology) | sana@mediaccess.in | Demo@1234 |
| Doctor (ENT) | vikram@mediaccess.in | Demo@1234 |
| Doctor (Paediatrics) | lakshmi@mediaccess.in | Demo@1234 |
| Nurse | nurse@mediaccess.in | Demo@1234 |
| Pharmacist | pharmacy@mediaccess.in | Demo@1234 |
| Lab tech | lab@mediaccess.in | Demo@1234 |
| Accountant + Reception | accounts@mediaccess.in | Demo@1234 |
| Pending nurse (blocked until approved) | deepa@mediaccess.in | Demo@1234 |
| Patient | patient@example.com | Demo@1234 |

Change these before any real deployment.

## URLs

| Page | URL |
|---|---|
| Public site | `/` |
| Public discovery and booking | `/specialties` · `/doctors` · `/book-appointment` |
| Patient register / login / portal / booking | `/register` · `/login` · `/portal` · `/portal/appointments` |
| Staff register / login | `/staff/register` · `/staff/login` |
| Dashboards | `/hms/dashboard/{admin,reception,doctor,nurse,pharmacy,lab,accounts}` |
| Billing | `/hms/dashboard/{admin,reception,accounts}/billing` |
| Prescriptions | `/hms/dashboard/{doctor,pharmacy,admin}/prescriptions` |
| Investigations | `/hms/dashboard/{doctor,lab,admin}/investigations` |
| IPD & operation theatre | `/hms/dashboard/{admin,reception,doctor,nurse}/ipd` |

## How auth works

1. **Patients** register and are `ACTIVE` immediately. **Staff** register as `PENDING` with the roles they *requested*;
   an admin approves (optionally changing roles) from the Admin dashboard. Login is refused until approved.
2. Login sets `access_token` and `refresh_token` as **httpOnly cookies**. The web app never touches tokens in JS.
3. Next.js `middleware.ts` decodes token claims for UX-level route selection. It does not verify signatures;
  the API verifies tokens and enforces authorization on every protected request. When the access token expires,
  the web app uses `/session/refresh` to rotate the refresh token silently.
4. **The API is the security boundary:** every protected route runs `authenticate` + `requireRole`, and admin
  mutations re-check the database (tokens can outlive a role change).
5. Reusing an already-rotated refresh token revokes the whole session family.

## Appointments

- Visitors choose a specialty, doctor, date and live available time from the public site. Booking verifies the patient's mobile by OTP, creates a portal account and central appointment record in one transaction, and starts a patient session. Existing patients can continue using **Patient portal → Book an appointment**.
- `GET /api/v1/specialties`, `GET /api/v1/doctors?specialty={slug}`, and
  `GET /api/v1/doctors/{id}/slots?date=YYYY-MM-DD` provide the public booking catalog.
- `POST /api/v1/public-bookings/otp` starts a ten-minute, rate-limited verification; `POST /api/v1/public-bookings/confirm` rechecks availability and atomically creates the patient and appointment. Development mode returns the OTP to the web UI; production requires an SMS or WhatsApp phone-verification channel. Expired verification data is pruned every five minutes.
- `POST /api/v1/appointments` books for the signed-in patient. `GET /api/v1/appointments` returns the patient's
  upcoming appointments; staff can request a specific date, and doctors only see their own appointments.
- `PATCH /api/v1/appointments/{id}` reschedules or changes an allowed status. `DELETE /api/v1/appointments/{id}`
  soft-cancels a booked appointment. Reception/Admin use `POST /api/v1/appointments/{id}/check-in` to issue a
  per-doctor daily queue token.
- Demo doctor schedules run Monday–Saturday, 09:00–13:00 and 14:00–17:00 in the tenant timezone (default
  `Asia/Kolkata`). An active-slot partial unique index prevents concurrent double bookings while allowing a
  cancelled slot to be booked again.
- Reception and Doctor appointment tables refresh every 20 seconds; Reception can check in booked appointments.

## Billing and payments

- Reception, Admin, and Accountant open **Billing & payments** from their dashboard. The **Services & rates** tab maintains service/procedure codes, HSN/SAC, unit prices, and exempt/taxable GST rates.
- **OPD billing** selects a patient, unbilled appointment, counter, rate-card lines, discount, and place of supply. Discount percentages above the tenant approval threshold stay pending until an Admin approves or rejects them.
- All amounts are stored as integer paise. GST is calculated per line, then split into CGST/SGST for intra-state supply or IGST for inter-state supply. Configure the tenant's legal name, GSTIN, billing state, and address under **GST setup**; configure patient state/place of supply when needed. Verify service tax treatment, HSN/SAC, and GST settings with the hospital's tax adviser before production use.
- The invoice PDF includes supplier GST details, HSN/SAC, line tax values, discounts, tender history, and balance due. Patients can download issued invoices from the patient portal.
- **Capture** supports split tenders across cash, card, UPI, bank transfer, and insurance/TPA. Each request requires an `Idempotency-Key`; payments are tenant-scoped and cannot exceed the outstanding balance.
- **Razorpay** checkout creates an order for the reserved outstanding amount. Configure a Razorpay webhook at `/api/v1/billing/webhooks/razorpay`; only signed `payment.captured` events create a payment record, and captured order/payment IDs are idempotent.
- Payment receipts are attempted over SMTP email and WhatsApp Cloud API. Delivery attempts and errors are recorded; staff can retry failed deliveries from the invoice ledger.
- The billing overview reports collection by clinic-local business date, payment-mode split, counter totals, discounts awaiting approval, and outstanding receivables. **Reconciliation** records a counted counter close and its variance.
- Existing doctor treatment billing remains at `POST /api/v1/appointments/{id}/treatment`. Invoice downloads use `GET /api/v1/invoices/{id}/pdf`.

Optional provider settings in `backend/.env`:

```dotenv
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v21.0
WHATSAPP_RECEIPT_TEMPLATE=payment_receipt
WHATSAPP_RECEIPT_LANGUAGE=en
WHATSAPP_OTP_TEMPLATE=
WHATSAPP_APPOINTMENT_TEMPLATE=
WHATSAPP_APPOINTMENT_LANGUAGE=en
MSG91_AUTH_KEY=
MSG91_OTP_TEMPLATE_ID=
MSG91_APPOINTMENT_TEMPLATE_ID=
```

Appointment confirmation attempts use each configured email, SMS, and WhatsApp channel. Configure MSG91 approved OTP/flow templates, and WhatsApp approved OTP/appointment templates, along with provider credentials. Delivery is best-effort after the appointment is committed. Razorpay, SMTP, and WhatsApp delivery remain unavailable until valid provider credentials/templates are configured.

## Prescriptions and investigations

- The Drug master stores generics, brand mappings, strengths, dosage forms, routes, and Schedule H/H1/X/NDPS classification. Catalog maintenance and interaction-rule authoring are limited to Pharmacist/Admin; prescribing is limited to Doctors.
- The prescription composer provides dosage/frequency/duration builders, quantity calculation, doctor favorites, reusable templates, and rule-based allergy/interaction checks. Allergy matches use recorded patient allergies and generic/brand names; interactions use tenant-authored rules. Warnings, including controlled-schedule review, must be acknowledged and are included in the signed prescription snapshot. This is a rules engine, not an AI or comprehensive clinical decision-support service; clinicians remain responsible for review.
- Issued prescriptions are bound to a SHA-256 HMAC using `PRESCRIPTION_SIGNING_SECRET` (or the access-token secret when unset). PDFs include prescriber name, medical registration number, patient, dosage instructions, schedule, warnings, and signature digest. Doctors must add their registration number before issuing.
- Investigation tests are routed to LAB, RADIOLOGY, or AUDIOLOGY. Lab/admin staff manage department worklists through ordered, collected, in-progress, completed, reported, and cancelled transitions; invalid transitions are rejected.
- Reports use five-minute S3 presigned PUT/GET URLs. The API only attaches uploads with server-generated tenant/order object-key prefixes after verifying S3 object type and size. Configure `AWS_REGION` and `S3_BUCKET`; `S3_ENDPOINT` supports S3-compatible local services. PDFs, PNGs, and JPEGs up to 20 MB are accepted.
- Reports link automatically to the order's patient and encounter. Report-ready in-app notifications are created for patients; critical reports additionally notify the ordering doctor. SMTP delivery is best-effort when mail settings are configured. Patients can open ready reports and notifications from the patient portal.

Clinical storage/signature settings in `backend/.env`:

```dotenv
PRESCRIPTION_SIGNING_SECRET=
AWS_REGION=ap-south-1
S3_BUCKET=
S3_ENDPOINT=
```

The seed command includes demo formulary entries, interaction rules, and investigation tests for each department.

Optional report/signature settings in `backend/.env`:

```dotenv
PRESCRIPTION_SIGNING_SECRET=
AWS_REGION=ap-south-1
S3_BUCKET=
S3_ENDPOINT=
```

The AWS SDK uses its standard credential provider chain (for example, an IAM task/instance role or `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`). Upload/report URLs return `REPORT_STORAGE_NOT_CONFIGURED` until a bucket and region are configured.

## Reception and OPD queue

- Reception uses **Register patient** to create an active patient account and generate an `MA-` MRN. Email, mobile, and a provided ABHA ID are duplicate-checked per tenant; patient consent and a patient-set portal password are required.
- ABHA ID is captured and stored but is not verified against an ABHA/ABDM service.
- **Add walk-in** searches by name, phone, email, MRN, or ABHA ID, then checks the patient in to the selected doctor. Walk-ins receive the next doctor/day token and are stored as `WALK_IN`; they do not reserve a scheduled appointment slot.
- The live OPD queue contains checked-in and in-consultation visits, sorted by token. Reception/Admin see the tenant queue; a Doctor sees only their assigned active queue. The WebSocket endpoint is `ws://localhost:4000/api/v1/queue/live` and requires the authenticated same-origin cookie. Redis Pub/Sub distributes tenant queue-change events between API instances; HTTP queue snapshots remain available at `GET /api/v1/queue`.
- Reception patient endpoints: `GET /api/v1/patients?search={name|phone|email|MRN|ABHA}` and `POST /api/v1/patients`. Walk-ins use `POST /api/v1/walk-ins`.

## IPD and operation theatre

- Admins configure wards, bed numbers, bed availability, theatres, and procedure templates from **IPD & OT**. The ward map refreshes every 15 seconds and shows active occupants.
- Reception/Admin can admit an existing patient to an available bed. Admission and a zero-balance running invoice are created together; additional IPD charges append to that invoice. Transfers lock the admission and both beds and retain an append-only transfer history.
- Nurses/Admin record admission-linked vitals, intake/output entries, and medication administration results. Doctors/Admin enter inpatient medication orders. Progress notes are append-only versions; concurrent doctor/nurse saves use an expected version and reject stale writes.
- Theatre cases reserve a theatre, surgeon, and anaesthetist. Scheduling serializes on those resources and rejects overlapping cases. Starting a case requires every WHO sign-in and time-out checklist item; completion requires sign-out and operative plus anaesthesia notes.
- Discharge generates a structured summary from the documented course and medication reconciliation, releases the bed to cleaning, and can book a real follow-up appointment against the doctor's active schedule. An unpaid balance requires an explicit acknowledgement but does not block clinical discharge.
- API routes are under `/api/v1/ipd`; ward/bed/theatre/template maintenance is Admin-only, admission is Reception/Admin, and nursing/clinical operations are role-scoped.

## Notes and next steps

- PostgreSQL and Redis use the explicit Docker volumes `mediaccess_app_pgdata` and `mediaccess_app_redisdata`; any older `mediaccess_pgdata` volume is left untouched. Set `REDIS_URL` for the backend when Redis is not local; the API requires Redis before it starts serving.
- Cookies work between `localhost:3000` and `localhost:4000` because they share a host. In production put web and API under the
  same parent domain (e.g. `app.example.in` and `api.example.in`) or proxy `/api` through Next.js.
- Refresh tokens are stored (hashed) in PostgreSQL. Redis is used for live queue event fan-out across API instances.
- Appointment tables on Reception and Doctor dashboards are live. Other dashboard KPIs and side panels remain static demo data in `web/lib/dashboards.ts`.
- Not yet included: admin MFA, forgot-password flow, inactivity auto-logout, audit-log viewer,
  refunds, insurer settlement/claims, lab analyzer integrations, Docker/CI files.
