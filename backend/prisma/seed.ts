import bcrypt from "bcryptjs";
import { DrugSchedule, InvestigationDepartment, InteractionSeverity, PrismaClient, Role, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: { name: "MediAccess Demo Hospital", slug: "demo" },
  });

  const demo = await bcrypt.hash("Demo@1234", 12);
  const admin = await bcrypt.hash("Admin@123", 12);

  const staff: Array<[string, string, string, Role[], UserStatus, string, string]> = [
    ["Dr. Meera Iyer", "admin@mediaccess.in", "EMP-001", [Role.ADMIN], UserStatus.ACTIVE, "9800000001", admin],
    ["Anita Rao", "reception@mediaccess.in", "EMP-002", [Role.RECEPTION], UserStatus.ACTIVE, "9800000002", demo],
    ["Dr. Arjun Nair", "doctor@mediaccess.in", "EMP-003", [Role.DOCTOR], UserStatus.ACTIVE, "9800000003", demo],
    ["Sr. Priya Das", "nurse@mediaccess.in", "EMP-004", [Role.NURSE], UserStatus.ACTIVE, "9800000004", demo],
    ["Rahul Shetty", "pharmacy@mediaccess.in", "EMP-005", [Role.PHARMACIST], UserStatus.ACTIVE, "9800000005", demo],
    ["Kavya Menon", "lab@mediaccess.in", "EMP-006", [Role.LAB_TECH], UserStatus.ACTIVE, "9800000006", demo],
    ["Suresh Kumar", "accounts@mediaccess.in", "EMP-007", [Role.ACCOUNTANT, Role.RECEPTION], UserStatus.ACTIVE, "9800000007", demo],
    ["Deepa Joshi", "deepa@mediaccess.in", "EMP-008", [Role.NURSE], UserStatus.PENDING, "9800000008", demo],
    ["Dr. Sana Khan", "sana@mediaccess.in", "EMP-009", [Role.DOCTOR], UserStatus.ACTIVE, "9800000009", demo],
    ["Dr. Vikram Rao", "vikram@mediaccess.in", "EMP-010", [Role.DOCTOR], UserStatus.ACTIVE, "9800000010", demo],
    ["Dr. Lakshmi P.", "lakshmi@mediaccess.in", "EMP-011", [Role.DOCTOR], UserStatus.ACTIVE, "9800000011", demo],
  ];

  for (const [name, email, employeeId, roles, status, phone, passwordHash] of staff) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      update: {},
      create: { tenantId: tenant.id, name, email, employeeId, roles, status, phone, passwordHash },
    });
  }

    const doctors: Array<[string, string[]]> = [
      ["doctor@mediaccess.in", ["Cardiology"]],
      ["sana@mediaccess.in", ["Neurology"]],
      ["vikram@mediaccess.in", ["ENT"]],
      ["lakshmi@mediaccess.in", ["Paediatrics"]],
    ];

    for (const [email, specialtyNames] of doctors) {
      const user = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
      if (!user) continue;

      const profile = await prisma.doctorProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { tenantId: tenant.id, userId: user.id },
      });

      for (const name of specialtyNames) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const specialty = await prisma.specialty.upsert({
          where: { tenantId_slug: { tenantId: tenant.id, slug } },
          update: {},
          create: { tenantId: tenant.id, name, slug },
        });
        await prisma.doctorSpecialty.upsert({
          where: { doctorId_specialtyId: { doctorId: profile.id, specialtyId: specialty.id } },
          update: {},
          create: { doctorId: profile.id, specialtyId: specialty.id },
        });
      }

      for (const weekday of [1, 2, 3, 4, 5, 6]) {
        for (const [startTime, endTime] of [["09:00", "13:00"], ["14:00", "17:00"]]) {
          await prisma.doctorSchedule.upsert({
            where: { doctorId_weekday_startTime: { doctorId: profile.id, weekday, startTime } },
            update: { endTime },
            create: { tenantId: tenant.id, doctorId: profile.id, weekday, startTime, endTime, slotMinutes: 20 },
          });
        }
      }
    }

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "patient@example.com" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Demo Patient",
      email: "patient@example.com",
      phone: "9811111111",
      passwordHash: demo,
      roles: [Role.PATIENT],
      status: UserStatus.ACTIVE,
      patient: { create: { tenantId: tenant.id, mrn: "MA-DEMO0001", dob: new Date("1990-05-14") } },
    },
  });

  const drugCatalog = [
    { genericName: "Amoxicillin", strength: "500 mg", dosageForm: "Capsule", route: "Oral", schedule: DrugSchedule.SCHEDULE_H, brands: [["Mox", "Sun Pharma"]] as [string, string][] },
    { genericName: "Azithromycin", strength: "500 mg", dosageForm: "Tablet", route: "Oral", schedule: DrugSchedule.SCHEDULE_H, brands: [["Azee", "Cipla"]] as [string, string][] },
    { genericName: "Atorvastatin", strength: "10 mg", dosageForm: "Tablet", route: "Oral", schedule: DrugSchedule.SCHEDULE_H, brands: [["Atorva", "Zydus"]] as [string, string][] },
    { genericName: "Warfarin", strength: "5 mg", dosageForm: "Tablet", route: "Oral", schedule: DrugSchedule.SCHEDULE_H1, brands: [["Warf", "Torrent"]] as [string, string][] },
    { genericName: "Paracetamol", strength: "500 mg", dosageForm: "Tablet", route: "Oral", schedule: DrugSchedule.UNSCHEDULED, brands: [["Crocin", "GSK"]] as [string, string][] },
    { genericName: "Ibuprofen", strength: "400 mg", dosageForm: "Tablet", route: "Oral", schedule: DrugSchedule.SCHEDULE_H, brands: [["Brufen", "Abbott"]] as [string, string][] },
  ];
  const drugIds = new Map<string, string>();
  for (const drug of drugCatalog) {
    const generic = await prisma.drugGeneric.upsert({
      where: { tenantId_genericName_strength_dosageForm_route: { tenantId: tenant.id, genericName: drug.genericName, strength: drug.strength, dosageForm: drug.dosageForm, route: drug.route } },
      update: { schedule: drug.schedule, isActive: true },
      create: { tenantId: tenant.id, genericName: drug.genericName, strength: drug.strength, dosageForm: drug.dosageForm, route: drug.route, schedule: drug.schedule },
    });
    drugIds.set(drug.genericName, generic.id);
    for (const [brandName, manufacturer] of drug.brands) {
      await prisma.drugBrand.upsert({
        where: { drugGenericId_brandName: { drugGenericId: generic.id, brandName } },
        update: { manufacturer, isActive: true },
        create: { tenantId: tenant.id, drugGenericId: generic.id, brandName, manufacturer },
      });
    }
  }

  const interactionRules = [
    { drugAId: drugIds.get("Amoxicillin")!, drugBId: drugIds.get("Warfarin")!, severity: InteractionSeverity.MAJOR, description: "Amoxicillin may increase anticoagulant effect and bleeding risk with warfarin.", recommendation: "Review INR and monitor for bleeding; consider an alternative antibiotic when clinically appropriate." },
    { drugAId: drugIds.get("Azithromycin")!, drugBId: drugIds.get("Warfarin")!, severity: InteractionSeverity.MAJOR, description: "Azithromycin may increase anticoagulant effect and bleeding risk with warfarin.", recommendation: "Review INR and monitor for bleeding during and after therapy." },
    { drugAId: drugIds.get("Atorvastatin")!, drugBId: drugIds.get("Azithromycin")!, severity: InteractionSeverity.MODERATE, description: "Macrolide antibiotics may increase statin exposure and myopathy risk.", recommendation: "Assess muscle symptoms and consider temporary dose interruption based on clinical context." },
  ];
  for (const rule of interactionRules) {
    const [drugAId, drugBId] = [rule.drugAId, rule.drugBId].sort();
    await prisma.drugInteraction.upsert({
      where: { tenantId_drugAId_drugBId: { tenantId: tenant.id, drugAId, drugBId } },
      update: { severity: rule.severity, description: rule.description, recommendation: rule.recommendation },
      create: { tenantId: tenant.id, ...rule, drugAId, drugBId },
    });
  }

  const investigationCatalog = [
    ["LAB-CBC", "Complete blood count", InvestigationDepartment.LAB],
    ["LAB-CMP", "Comprehensive metabolic panel", InvestigationDepartment.LAB],
    ["LAB-TSH", "Thyroid stimulating hormone", InvestigationDepartment.LAB],
    ["RAD-CXR", "Chest X-ray", InvestigationDepartment.RADIOLOGY],
    ["RAD-USG", "Ultrasound abdomen", InvestigationDepartment.RADIOLOGY],
    ["RAD-ECG", "12-lead ECG", InvestigationDepartment.RADIOLOGY],
    ["AUD-AUDIO", "Pure tone audiometry", InvestigationDepartment.AUDIOLOGY],
    ["AUD-TYMP", "Tympanometry", InvestigationDepartment.AUDIOLOGY],
  ] as const;
  for (const [code, name, department] of investigationCatalog) {
    await prisma.investigationTest.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code } },
      update: { name, department, isActive: true },
      create: { tenantId: tenant.id, code, name, department },
    });
  }

    console.log("Seeded tenant 'demo', staff users, one patient, doctor schedules, drug/formulary rules, and investigation tests.");
}

main().finally(() => prisma.$disconnect());
