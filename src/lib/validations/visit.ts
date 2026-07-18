import { z } from "zod";

export const visitArrivalTypeEnum = z.enum([
  "WITH_APPOINTMENT",
  "WITHOUT_APPOINTMENT",
  "UNSCHEDULED_FOLLOWUP",
  "PRIORITY",
  "ADMINISTRATIVE_URGENCY",
]);
export const visitPriorityEnum = z.enum(["NORMAL", "HIGH", "URGENT"]);

export const createVisitSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  doctorId: z.string().min(1, "Selecciona un médico"),
  branchId: z.string().optional(),
  arrivalType: visitArrivalTypeEnum,
  reason: z.string().max(500).optional().or(z.literal("")),
  priority: visitPriorityEnum.default("NORMAL"),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
