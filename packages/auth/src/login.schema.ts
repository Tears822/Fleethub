import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
