import { ENV } from "./env";

// ─── Email Provider Interface ─────────────────────────────────────────────────
// Default adapter: Resend (https://resend.com)
// To swap providers, implement sendEmail() below using your preferred service
// (Postmark, SMTP via nodemailer, AWS SES, etc.) and update the env config.

const RESEND_API = "https://api.resend.com/emails";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!ENV.resendApiKey) {
    console.error(
      "[Email] RESEND_API_KEY is not configured. " +
        "Set it in your .env file to enable email delivery."
    );
    return false;
  }

  try {
    const response = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.emailFromAddress,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[Email] Delivery failed (${response.status}): ${detail}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Email] Error sending message:", error);
    return false;
  }
}

// ─── Magic Link Email ─────────────────────────────────────────────────────────

export async function sendMagicLinkEmail(
  to: string,
  magicLink: string
): Promise<boolean> {
  const appName = ENV.appName;

  const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #000; color: #fff; border-radius: 8px;">
      <div style="margin-bottom: 32px;">
        <span style="font-size: 20px; font-weight: 700; letter-spacing: 0.05em; color: #fff;">${'${appName}'}</span>
      </div>
      <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em;">Sign in to ${'${appName}'}</h1>
      <p style="color: #888; margin: 0 0 32px; font-size: 15px;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
      <a href="${'${magicLink}'}" style="display: block; background: #4f46e5; color: #fff; font-weight: 700; font-size: 15px; text-align: center; padding: 16px 24px; border-radius: 6px; text-decoration: none; letter-spacing: 0.05em; margin-bottom: 32px;">SIGN IN</a>
      <p style="color: #555; font-size: 13px; margin: 0 0 8px;">Or copy and paste this link into your browser:</p>
      <p style="color: #444; font-size: 12px; word-break: break-all; margin: 0 0 32px;">${'${magicLink}'}</p>
      <p style="color: #555; font-size: 13px; margin: 0;">If you did not request this link, you can safely ignore this email.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Your ${'${appName}'} sign-in link`,
    html,
  });
}

// Keep for API compatibility.
export async function sendOtpEmail(to: string, otp: string): Promise<boolean> {
  return sendMagicLinkEmail(to, otp);
}
