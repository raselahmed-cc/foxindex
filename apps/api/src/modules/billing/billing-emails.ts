const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px">${escape(title)}</h2>${body}
    <p style="color:#888;font-size:12px;margin-top:24px">FoxIndex</p></div>`;
}

export function paymentApprovedEmail(name: string, reference: string, credits: number, balance: number) {
  return {
    subject: `Payment ${reference} confirmed — ${credits.toLocaleString()} credits added`,
    html: layout(
      'Payment confirmed',
      `<p>Hi ${escape(name)}, your payment <b>${escape(reference)}</b> was confirmed and
       <b>${credits.toLocaleString()} credits</b> were added. Your balance is now <b>${balance.toLocaleString()}</b>.</p>`,
    ),
  };
}

export function paymentRejectedEmail(name: string, reference: string, reason: string) {
  return {
    subject: `Payment ${reference} could not be confirmed`,
    html: layout(
      'Payment not confirmed',
      `<p>Hi ${escape(name)}, we couldn't confirm payment <b>${escape(reference)}</b>.</p>
       <p>Reason: ${escape(reason)}</p><p>Reply in live chat if you think this is a mistake.</p>`,
    ),
  };
}

export function paymentSubmittedEmail(managerName: string, clientName: string, reference: string, amount: string) {
  return {
    subject: `Manual payment ${reference} waiting for review`,
    html: layout(
      'Payment waiting for review',
      `<p>Hi ${escape(managerName)}, ${escape(clientName)} submitted manual payment <b>${escape(reference)}</b>
       (${escape(amount)}). Review it in Credit requests.</p>`,
    ),
  };
}
