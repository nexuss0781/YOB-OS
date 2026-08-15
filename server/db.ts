import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import {
  mapUser,
  rows,
  type InsertUser,
  type User,
  withParadox,
} from "./paradox";

export type { InsertUser, User } from "./paradox";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  await withParadox(
    db => {
      const now = Date.now();
      const existing = rows<{ id: number; role: "user" | "admin" }>(
        db,
        "SELECT id, role FROM users WHERE open_id = ? LIMIT 1",
        [user.openId]
      )[0];
      const role = user.role ?? existing?.role ?? "user";
      const lastSignedIn = (user.lastSignedIn ?? new Date()).getTime();

      if (!existing) {
        db.execute(
          `INSERT INTO users (
            open_id, name, email, login_method, password_hash, role, created_at, updated_at, last_signed_in
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.openId,
            user.name ?? null,
            user.email ?? null,
            user.loginMethod ?? null,
            user.passwordHash ?? null,
            role,
            now,
            now,
            lastSignedIn,
          ]
        );
        return;
      }

      const assignments: string[] = [
        "role = ?",
        "updated_at = ?",
        "last_signed_in = ?",
      ];
      const params: unknown[] = [role, now, lastSignedIn];
      if (user.name !== undefined) {
        assignments.push("name = ?");
        params.push(user.name);
      }
      if (user.email !== undefined) {
        assignments.push("email = ?");
        params.push(user.email);
      }
      if (user.loginMethod !== undefined) {
        assignments.push("login_method = ?");
        params.push(user.loginMethod);
      }
      if (user.passwordHash !== undefined) {
        assignments.push("password_hash = ?");
        params.push(user.passwordHash);
      }
      params.push(user.openId);
      db.execute(
        `UPDATE users SET ${assignments.join(", ")} WHERE open_id = ?`,
        params
      );
    },
    { write: true }
  );
}

export async function getUserByOpenId(
  openId: string
): Promise<User | undefined> {
  return withParadox(db => {
    const row = rows<Parameters<typeof mapUser>[0]>(
      db,
      "SELECT * FROM users WHERE open_id = ? LIMIT 1",
      [openId]
    )[0];
    return row ? mapUser(row) : undefined;
  });
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<User> {
  return withParadox(
    db => {
      const existing = rows<{ id: number }>(
        db,
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [input.email]
      )[0];
      if (existing) throw new Error("EMAIL_IN_USE");

      const now = Date.now();
      const openId = `local_${randomUUID()}`;
      db.execute(
        `INSERT INTO users (
          open_id, name, email, login_method, password_hash, role, created_at, updated_at, last_signed_in
        ) VALUES (?, ?, ?, 'password', ?, 'user', ?, ?, ?)`,
        [openId, input.name, input.email, input.passwordHash, now, now, now]
      );
      const row = rows<Parameters<typeof mapUser>[0]>(
        db,
        "SELECT * FROM users WHERE open_id = ? LIMIT 1",
        [openId]
      )[0];
      if (!row) throw new Error("Unable to create account.");
      return mapUser(row);
    },
    { write: true }
  );
}

export async function getLocalUserCredentials(email: string) {
  return withParadox(db => {
    const row = rows<
      Parameters<typeof mapUser>[0] & { password_hash: string | null }
    >(db, "SELECT * FROM users WHERE email = ? LIMIT 1", [email])[0];
    if (!row?.password_hash) return undefined;
    return { user: mapUser(row), passwordHash: row.password_hash };
  });
}

export async function recordLocalSignIn(openId: string) {
  await withParadox(
    db => {
      const now = Date.now();
      db.execute(
        "UPDATE users SET last_signed_in = ?, updated_at = ? WHERE open_id = ?",
        [now, now, openId]
      );
    },
    { write: true }
  );
}
