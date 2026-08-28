import { describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn().mockResolvedValue(undefined);
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

describe('createMailer', () => {
  it('configures a transport with the given SMTP options', async () => {
    const { createMailer } = await import('./mailer');
    createMailer({ host: 'localhost', port: 1025, from: 'FoxIndex <no-reply@foxindex.dev>' });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 1025, secure: false }),
    );
  });

  it('marks port 465 as a secure connection', async () => {
    const { createMailer } = await import('./mailer');
    createMailer({ host: 'smtp.example.com', port: 465, from: 'a@b.com' });

    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ secure: true }));
  });

  it('omits auth when no user/pass is supplied', async () => {
    const { createMailer } = await import('./mailer');
    createMailer({ host: 'localhost', port: 1025, from: 'a@b.com' });

    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ auth: undefined }));
  });

  it('send() delegates to the transport with from/to/subject/html', async () => {
    const { createMailer } = await import('./mailer');
    const mailer = createMailer({ host: 'localhost', port: 1025, from: 'FoxIndex <no-reply@foxindex.dev>' });

    await mailer.send('user@example.com', 'Verify your email', '<p>hi</p>');

    expect(sendMail).toHaveBeenCalledWith({
      from: 'FoxIndex <no-reply@foxindex.dev>',
      to: 'user@example.com',
      subject: 'Verify your email',
      html: '<p>hi</p>',
    });
  });
});
