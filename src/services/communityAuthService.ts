import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, verifyPassword } from './communitySession.js';

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(2).max(120),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export async function registerCommunityUser(input: z.infer<typeof registerSchema>) {
  const email = input.email.toLowerCase();
  const existing = await prisma.communityUser.findUnique({ where: { email } });
  if (existing) throw conflict('An account with this email already exists');

  return prisma.communityUser.create({
    data: {
      email,
      passwordHash: hashPassword(input.password),
      displayName: input.displayName,
      role: 'MEMBER',
      canPost: true,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      canPost: true,
      createdAt: true,
    },
  });
}

export async function loginCommunityUser(input: z.infer<typeof loginSchema>) {
  const email = input.email.toLowerCase();
  const user = await prisma.communityUser.findUnique({ where: { email } });
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw unauthorized('Invalid email or password');
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    canPost: user.canPost,
  };
}

export async function getCommunityUserById(userId: string) {
  return prisma.communityUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      canPost: true,
    },
  });
}

export function assertPasswordOk(password: string) {
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');
}
