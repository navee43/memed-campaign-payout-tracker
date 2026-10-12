import argon2 from "argon2";

/**
 * Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations,
 * 1 lane). Parameters are encoded in each hash, so they can be raised later
 * without breaking existing passwords.
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash so "unknown email" takes as long as
 * "wrong password" — prevents account enumeration by timing.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("memed-timing-equaliser-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}
