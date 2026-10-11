import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@foxindex/types';
import { ChatService } from './chat.service';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import type { ChatRepository } from './chat.repository';

const CONV = { id: 'c1', clientId: 'client', managerId: 'manager' };

function service(repoOverrides: Record<string, unknown> = {}) {
  const repo = {
    findConversationById: vi.fn(async () => CONV),
    findMessage: vi.fn(),
    markRead: vi.fn(async () => ['m1']),
    ...repoOverrides,
  };
  const svc = new ChatService({} as never, repo as unknown as ChatRepository, {} as never, {} as never);
  return { svc, repo };
}

describe('ChatService access rules', () => {
  it('lets participants and admins in, keeps everyone else out', async () => {
    const { svc } = service();
    await expect(svc.assertAccess('c1', { id: 'client', role: UserRole.CLIENT })).resolves.toMatchObject({ participant: true });
    await expect(svc.assertAccess('c1', { id: 'admin', role: UserRole.ADMIN })).resolves.toMatchObject({ participant: false });
    await expect(svc.assertAccess('c1', { id: 'other-manager', role: UserRole.MANAGER })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(svc.assertAccess('c1', { id: 'another-client', role: UserRole.CLIENT })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('404s an unknown conversation', async () => {
    const { svc } = service({ findConversationById: vi.fn(async () => undefined) });
    await expect(svc.assertAccess('x', { id: 'client', role: UserRole.CLIENT })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('never lets a supervising admin mark the manager’s messages read', async () => {
    const { svc, repo } = service();
    await expect(svc.markRead('c1', { id: 'admin', role: UserRole.SUPERADMIN })).resolves.toEqual([]);
    expect(repo.markRead).not.toHaveBeenCalled();
    await expect(svc.markRead('c1', { id: 'manager', role: UserRole.MANAGER })).resolves.toEqual(['m1']);
  });

  it('only staff may attach reply buttons', async () => {
    const { svc } = service();
    await expect(
      svc.sendMessage({ id: 'client', role: UserRole.CLIENT }, { conversationId: 'c1', body: 'hi', attachmentIds: [], quickReplies: ['Yes'] }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('rejects answering a quick reply that was not offered or already answered', async () => {
    const offered = { id: 'q1', conversationId: 'c1', meta: { quickReplies: ['Yes', 'No'] } };
    const { svc, repo } = service({ findMessage: vi.fn(async () => offered) });
    await expect(
      svc.sendMessage({ id: 'client', role: UserRole.CLIENT }, { conversationId: 'c1', body: 'Maybe', attachmentIds: [], replyTo: 'q1' }),
    ).rejects.toBeInstanceOf(ValidationError);
    repo.findMessage.mockResolvedValueOnce({ ...offered, meta: { quickReplies: ['Yes'], answered: 'Yes' } });
    await expect(
      svc.sendMessage({ id: 'client', role: UserRole.CLIENT }, { conversationId: 'c1', body: 'Yes', attachmentIds: [], replyTo: 'q1' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('lets only staff change availability', async () => {
    const { svc } = service();
    await expect(svc.setAvailability({ id: 'client', role: UserRole.CLIENT }, 'away')).rejects.toBeInstanceOf(AuthorizationError);
  });
});
