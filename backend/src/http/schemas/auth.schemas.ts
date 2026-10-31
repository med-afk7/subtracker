import { z } from 'zod';
import { isValidTimezone } from '../../domain/timezone.js';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('A valid email is required'));

// New passwords. The upper bound stops huge inputs from tying up the CPU in Argon2.
const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(256, 'Password must be at most 256 characters');

// Existing passwords are only checked, not validated against today's rules
const passwordSchema = z.string().min(1, 'Password is required').max(256);

const tokenSchema = z.string().min(1, 'Token is required').max(200);

export const timezoneSchema = z
  .string()
  .refine(isValidTimezone, { message: 'Unknown timezone (use an IANA name like Europe/London)' });

export const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  // Optional: the browser's timezone. Invalid values fall back to UTC instead of failing sign-up.
  timezone: z.string().max(100).optional(),
});

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });
export const emailOnlySchema = z.object({ email: emailSchema });
export const tokenOnlySchema = z.object({ token: tokenSchema });
export const resetPasswordSchema = z.object({ token: tokenSchema, newPassword: newPasswordSchema });
export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: newPasswordSchema,
});

export const updateAccountSchema = z.object({ timezone: timezoneSchema });
export const deleteAccountSchema = z.object({ password: passwordSchema });
