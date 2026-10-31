import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, type UserRow } from '../db/schema.js';

export interface PublicUser {
  id: string;
  email: string;
  timezone: string;
  createdAt: string;
}

// Never send the password hash (or anything else internal) to the client
export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    timezone: user.timezone,
    createdAt: user.createdAt.toISOString(),
  };
}

export const findUserByEmail = (email: string) =>
  db.query.users.findFirst({ where: eq(users.email, email) });

export const findUserById = (id: string) => db.query.users.findFirst({ where: eq(users.id, id) });
