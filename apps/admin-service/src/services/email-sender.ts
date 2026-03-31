import { Resend } from 'resend';
import type { AdminConfig } from '../config.js';

let resend: Resend | null = null;
let fromEmail = 'IntelWatch ETIP <noreply@intelwatch.in>';

/** Initialise Resend client. Call once at startup. */
export function initEmailSender(config: AdminConfig): void {
  if (!config.TI_RESEND_API_KEY) return;
  resend = new Resend(config.TI_RESEND_API_KEY);
  fromEmail = config.TI_FROM_EMAIL;
}

/** Returns true if Resend is configured and ready. */
export function isEmailReady(): boolean {
  return resend !== null;
}

interface InviteEmailParams {
  to: string;
  orgName: string;
  ownerName: string;
  inviteToken: string;
  platformUrl: string;
}

/** Send a client onboarding invite email via Resend. */
export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!resend) return;

  const inviteLink = `${params.platformUrl}/onboard/invite?token=${params.inviteToken}&email=${encodeURIComponent(params.to)}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0a0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#111827;border:1px solid #1e293b;border-radius:12px;overflow:hidden;">
    <!-- Header -->
    <div style="padding:24px 32px;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">
        IntelWatch ETIP
      </h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
        Enterprise Threat Intelligence Platform
      </p>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="color:#e2e8f0;font-size:15px;margin:0 0 8px;">
        Hi ${params.ownerName},
      </p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
        You've been invited to join <strong style="color:#e2e8f0;">${params.orgName}</strong> on
        the IntelWatch Threat Intelligence Platform. Set up your admin account and choose a plan
        to start monitoring threats.
      </p>

      <!-- CTA Button -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${inviteLink}"
           style="display:inline-block;padding:12px 32px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
          Set Up Your Account
        </a>
      </div>

      <p style="color:#64748b;font-size:12px;line-height:1.5;margin:24px 0 0;">
        This invite is tied to <strong style="color:#94a3b8;">${params.to}</strong>.
        Only this email can claim the invitation. If you didn't expect this, you can safely ignore it.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #1e293b;text-align:center;">
      <p style="color:#475569;font-size:11px;margin:0;">
        &copy; ${new Date().getFullYear()} IntelWatch &middot; ti.intelwatch.in
      </p>
    </div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: fromEmail,
    to: params.to,
    subject: `You're invited to ${params.orgName} on IntelWatch ETIP`,
    html,
    text: `Hi ${params.ownerName},\n\nYou've been invited to join ${params.orgName} on IntelWatch ETIP.\n\nSet up your account: ${inviteLink}\n\nThis invite is for ${params.to} only.`,
  });
}
