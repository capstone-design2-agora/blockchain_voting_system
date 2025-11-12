import { Resend } from "resend";
import { getEnv } from "./env.js";

let resendClient;

function getResend() {
  if (!resendClient) {
    const { resendApiKey } = getEnv();
    resendClient = new Resend(resendApiKey);
  }
  return resendClient;
}

export async function sendVerificationEmail({ to, code, expiresAt }) {
  const { resendFromEmail, resendSenderName } = getEnv();
  const subject = "Your Agora verification code";
  const text = `인증 코드: ${code}\n5분 내에 입력해주세요.`;
  const html = `<!doctype html>
  <html>
    <body style="font-family:Arial,sans-serif;color:#0f172a;">
      <p style="font-size:16px;">안녕하세요,</p>
      <p style="font-size:16px;">아래 6자리 코드를 <strong>${expiresAt}</strong> 이전에 입력해주세요.</p>
      <p style="font-size:32px;letter-spacing:6px;font-weight:700;">${code}</p>
      <p style="font-size:14px;color:#475569;">본 메일은 발신 전용입니다.</p>
    </body>
  </html>`;

  const { error } = await getResend().emails.send({
    from: `${resendSenderName} <${resendFromEmail}>`,
    to,
    subject,
    text,
    html
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
