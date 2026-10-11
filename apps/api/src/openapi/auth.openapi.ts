import { z } from 'zod';
import { loginSchema, registerSchema, verifyEmailSchema } from '@foxindex/validation';
import { UserRole, UserStatus } from '@foxindex/types';
import { openApiRegistry } from './registry';

const publicUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/register',
  summary: 'Create an account — starts pending_email, sends a 6-digit verification code by email',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: registerSchema } } } },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ email: z.string() }) } } },
    400: { description: 'Email already registered' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/verify-email',
  summary: 'Verify the 6-digit code — moves the account to pending_approval and auto-assigns a manager',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: verifyEmailSchema } } } },
  responses: {
    200: {
      description: 'OK',
      content: { 'application/json': { schema: z.object({ status: z.enum(UserStatus) }) } },
    },
    400: { description: 'Invalid or expired code' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/login',
  summary: 'Log in — returns a short-lived JWT access token; sets an httpOnly refresh-token cookie',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: loginSchema } } } },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': { schema: z.object({ accessToken: z.string(), user: publicUserSchema }) },
      },
    },
    401: { description: 'Invalid credentials, unverified email, pending approval, or suspended' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  summary: 'Exchange the httpOnly refresh-token cookie for a new access token (rotates the refresh token)',
  tags: ['Auth'],
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({ accessToken: z.string() }) } } },
    401: { description: 'No or invalid refresh-token cookie' },
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: '/auth/logout',
  summary: 'Revoke the current refresh token and clear its cookie',
  tags: ['Auth'],
  responses: { 204: { description: 'Logged out' } },
});
