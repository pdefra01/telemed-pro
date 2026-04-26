import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email({ message: "Email inválido" }),
    password: z.string().min(8, { message: "La contraseña debe tener al menos 8 caracteres" }),
});

export const dniSchema = z.string().regex(/^\d{7,11}$/, { message: "DNI inválido" });

export const phoneSchema = z.string().min(10, { message: "Teléfono inválido" });

export type LoginInput = z.infer<typeof loginSchema>;
