import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const HASH_BYTES = 64;
const MIN_PASSWORD_LENGTH = 10;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Use at least 10 characters for your password.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Use both letters and numbers in your password.";
  }
  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scrypt(password, salt, HASH_BYTES)) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;

  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
