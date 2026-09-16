import { z } from "zod";

import { UserRoles } from "@/types/models";

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(80, "Keep the name under 80 characters"),
  description: z.string().trim().max(500, "Keep it under 500 characters"),
});
export type ProjectValues = z.infer<typeof projectSchema>;

export const addMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email"),
  role: z.enum([UserRoles.ADMIN, UserRoles.PROJECT_ADMIN, UserRoles.MEMBER]),
});
export type AddMemberValues = z.infer<typeof addMemberSchema>;
