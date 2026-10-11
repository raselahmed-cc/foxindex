import { EMAIL_VERIFICATION_CODE_TTL_MINUTES } from '@foxindex/config';

export interface EmailContent {
  subject: string;
  html: string;
}

export function verificationCodeEmail(code: string): EmailContent {
  return {
    subject: 'Verify your FoxIndex email',
    html: `<p>Your verification code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
<p>This code expires in ${EMAIL_VERIFICATION_CODE_TTL_MINUTES} minutes.</p>`,
  };
}

export function managerAssignedEmail(clientName: string, clientEmail: string): EmailContent {
  return {
    subject: 'New client awaiting approval',
    html: `<p>${clientName} (${clientEmail}) has verified their email and been assigned to you.</p>
<p>Review and approve their account from the manager dashboard.</p>`,
  };
}

export function accountApprovedEmail(name: string): EmailContent {
  return {
    subject: 'Your FoxIndex account is active',
    html: `<p>Hi ${name},</p>
<p>Your account has been approved. You can sign in now.</p>`,
  };
}
