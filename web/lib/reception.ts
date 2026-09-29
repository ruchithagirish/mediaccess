export interface ReceptionPatient {
  id: string;
  mrn: string;
  abhaId: string | null;
  dob: string;
  name: string;
  email: string;
  phone: string | null;
}

export interface QueueEntry {
  id: string;
  tokenNumber: number | null;
  source: "SCHEDULED" | "WALK_IN";
  status: "CHECKED_IN" | "IN_CONSULTATION";
  checkedInAt: string | null;
  patient: { id: string; name: string; mrn: string };
  doctor: { id: string; name: string };
}