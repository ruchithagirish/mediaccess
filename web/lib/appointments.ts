export type AppointmentStatus =
  | "BOOKED"
  | "CHECKED_IN"
  | "IN_CONSULTATION"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface SpecialtyOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface DoctorOption {
  id: string;
  name: string;
  consultationMinutes: number;
  specialties: Pick<SpecialtyOption, "id" | "name" | "slug">[];
}

export interface AppointmentSummary {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  status: AppointmentStatus;
  tokenNumber: number | null;
  checkedInAt: string | null;
  patient: { id: string; name: string; mrn: string };
  doctor: {
    id: string;
    name: string;
    specialties: Pick<SpecialtyOption, "id" | "name" | "slug">[];
  };
}