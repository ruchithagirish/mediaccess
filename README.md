MediAccess — Hospital Management System & Patient Portal
MediAccess is a multi-tenant, full-stack Hospital Management System (HMS) and public patient portal built with Next.js 14, Express, Prisma, and PostgreSQL.

It implements comprehensive healthcare workflows including role-based access control (RBAC), tenant-scoped appointment booking, live OPD queues, GST-aware billing, e-prescriptions, lab investigations, and IPD/OT management.

Tech Stack
Frontend: Next.js 14 (App Router), Tailwind CSS

Backend: Express, TypeScript, Prisma ORM

Database: PostgreSQL (Docker)

Auth: JWT access tokens (15-min) + rotating refresh tokens with reuse detection (stored as HTTP-only cookies)

Project Structure
Plaintext
mediaccess/
├── docker-compose.yml     # PostgreSQL service
├── backend/               # Express + TypeScript + Prisma API
└── web/                   # Next.js 14 Public Website & HMS Dashboards
Getting Started
Prerequisites
Node.js (v20+)

Docker & Docker Compose

1. Database Setup
Start the local PostgreSQL container:

Bash
docker compose up -d
2. Backend Setup
Navigate to the backend directory, configure environment variables, run migrations, seed data, and start the development server:

Bash
cd backend
cp .env.example .env            # Set JWT_ACCESS_SECRET (32+ random chars)
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev                     # Runs on http://localhost:4000
3. Web Frontend Setup
In a new terminal window, navigate to the web directory, configure environment variables, and start the development server:

Bash
cd web
cp .env.local.example .env.local   # Adjust NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                        # Runs on http://localhost:3000

Core Modules & Features
Public Website & Patient Portal: Patient registration/login, doctor discovery, specialty catalog, appointment booking, rescheduling, cancellation, and invoice/report downloads.

Staff HMS & Role Dashboards: Multi-select role registration with admin approval workflows. Dedicated dashboards for Admin, Receptionist, Doctor, Nurse, Pharmacist, Lab Technician, and Accountant.

Reception & OPD Queue: Patient intake with MRN/ABHA ID capture, duplicate checking, walk-in management, check-in tokens, and a WebSocket-powered live OPD queue (ws://localhost:4000/api/v1/queue/live).

Billing & Payments: Service rate cards, HSN/SAC codes, GST calculations (CGST/SGST/IGST), discount threshold approvals, counter reconciliation, multi-mode payment capture (Cash, Card, UPI, Bank Transfer, Insurance), and PDF receipts.

Prescriptions & Investigations: Drug formulary catalog, schedule classifications (H, H1, X, NDPS), rule-based allergy/interaction checks, signed e-prescriptions with HMAC validation, department worklists, and S3-compatible report uploads.

IPD & Operation Theatre: Ward and bed management, admission-linked vitals, intake/output records, inpatient medication orders, version-controlled progress notes, WHO checklist-compliant OT theatre scheduling, and structured discharge summaries.
