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
      const role =
        user.role ??
        (user.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "user");
      const lastSignedIn = (user.lastSignedIn ?? new Date()).getTime();

      if (!existing) {
        db.execute(
          `INSERT INTO users (
            open_id, name, email, login_method, role, created_at, updated_at, last_signed_in
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.openId,
            user.name ?? null,
            user.email ?? null,
            user.loginMethod ?? null,
            role,
            now,
            now,
            lastSignedIn,
          ]
        );
        return;
      }

      const assignments: string[] = ["role = ?", "updated_at = ?", "last_signed_in = ?"];
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
      params.push(user.openId);
      db.execute(
        `UPDATE users SET ${assignments.join(", ")} WHERE open_id = ?`,
        params
      );
    },
    { write: true }
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  return withParadox(db => {
    const row = rows<Parameters<typeof mapUser>[0]>(
      db,
      "SELECT * FROM users WHERE open_id = ? LIMIT 1",
      [openId]
    )[0];
    return row ? mapUser(row) : undefined;
  });
}
