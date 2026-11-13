import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { env } from "./env";
import { ApiError } from "./errors";
import { isUniqueViolation } from "./prisma-errors";

export const SESSION_COOKIE = "sid";

export type CurrentUser = {
  id: string;
  email: string;
  displayName: string;
  balance: number;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000,
  );
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: env.sessionTtlDays * 24 * 60 * 60,
  });
  return token;
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session
      .delete({ where: { tokenHash: session.tokenHash } })
      .catch(() => undefined);
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: session.user.displayName,
    balance: session.user.balance,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "Login required");
  return user;
}

export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<CurrentUser> {
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName },
    });
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      balance: user.balance,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, "EMAIL_TAKEN", "Email is already registered");
    }
    throw error;
  }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<CurrentUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    balance: user.balance,
  };
}
