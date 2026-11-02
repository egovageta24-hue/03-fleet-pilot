import { z } from "zod";
import { EXCEPTION_SEVERITIES, EXCEPTION_TYPES, ORDER_PRIORITIES } from "@/lib/domain";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const createOrderSchema = z
  .object({
    merchantName: z.string().trim().min(1, "Merchant is required").max(120),
    pickupAddressId: z.uuid("Choose a pickup location"),
    customer: z.object({
      name: z.string().trim().min(1, "Customer name is required").max(120),
      phone: optionalText(40),
      email: z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? v : undefined))
        .pipe(z.email("Enter a valid email").optional()),
    }),
    delivery: z.object({
      line1: z.string().trim().min(1, "Street address is required").max(160),
      line2: optionalText(160),
      city: z.string().trim().min(1, "City is required").max(80),
      postcode: z.string().trim().min(1, "Postcode is required").max(20),
      areaId: z.uuid("Choose a delivery area"),
    }),
    priority: z.enum(ORDER_PRIORITIES).default("normal"),
    packages: z.coerce.number().int().min(1).max(99),
    weightKg: z.coerce.number().min(0.1, "Weight must be at least 0.1 kg").max(2000),
    notes: optionalText(1000),
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
  })
  .refine((v) => v.windowEnd > v.windowStart, {
    path: ["windowEnd"],
    message: "Delivery window must end after it starts",
  });
export type CreateOrderInput = z.output<typeof createOrderSchema>;

export const assignSchema = z.object({
  orderId: z.uuid(),
  driverId: z.uuid("Choose a driver"),
  reason: optionalText(300),
  /** Driver the user saw on the order when they opened the dialog (null = unassigned). */
  expectedDriverId: z.uuid().nullable().optional(),
});

export const bulkAssignSchema = z.object({
  orderIds: z.array(z.uuid()).min(1, "Select at least one order").max(100),
  driverId: z.uuid("Choose a driver"),
});

export const unassignSchema = z.object({
  orderId: z.uuid(),
  reason: optionalText(300),
});

export const prioritySchema = z.object({
  orderId: z.uuid(),
  priority: z.enum(ORDER_PRIORITIES),
});

export const advanceSchema = z.object({
  orderId: z.uuid(),
  to: z.enum(["picked_up", "out_for_delivery", "delivered", "failed", "cancelled"]),
  note: optionalText(300),
});

export const raiseExceptionSchema = z.object({
  orderId: z.uuid(),
  type: z.enum(EXCEPTION_TYPES),
  severity: z.enum(EXCEPTION_SEVERITIES).default("warning"),
  description: optionalText(500),
  markFailed: z.boolean().default(false),
});

export const resolveExceptionSchema = z.object({
  exceptionId: z.uuid(),
  resolutionNote: z.string().trim().min(1, "Add a short resolution note").max(500),
});
