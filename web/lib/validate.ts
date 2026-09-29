export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const validPhone = (p: string) => /^[6-9]\d{9}$/.test(p.replace(/\D/g, "").slice(-10));
export function strengthScore(p: string) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
