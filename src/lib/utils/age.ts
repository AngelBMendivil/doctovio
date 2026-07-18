import { differenceInYears } from "date-fns";

export function calculateAge(birthDate: Date | string): number {
  const date = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  return differenceInYears(new Date(), date);
}
