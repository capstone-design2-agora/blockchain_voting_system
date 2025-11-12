import crypto from "node:crypto";
import { z } from "zod";
import { getEnv } from "./_lib/env.js";
import { getSupabaseClient } from "./_lib/supabase.js";
import { normalizeEmail, normalizeWalletAddress, isDomainAllowed, createLookupHmac, hashVerificationCode, hashIpAddress } from "./_lib/crypto.js";
import { bufferToPgBytea } from "./_lib/bytea.js";
import { sendVerificationEmail } from "./_lib/email.js";
import { enforceRateLimit } from "./_lib/rate-limit.js";
import { ValidationError, HttpError } from "./_lib/errors.js";
import { readJsonBody, getRequestIp } from "./_lib/request.js";

const requestSchema = z.object({
  email: z.string().email(),
  walletAddress: z.string().min(1),
  recaptchaToken: z.string().min(10).optional()
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const { email, walletAddress } = requestSchema.parse(body);
    const env = getEnv();
    const normalizedEmail = normalizeEmail(email);
    let normalizedWallet;
    try {
      normalizedWallet = normalizeWalletAddress(walletAddress);
    } catch {
      throw new ValidationError("Invalid wallet address");
    }

    if (!isDomainAllowed(normalizedEmail, env.emailDomainAllowlist)) {
      throw new ValidationError("Email domain is not allowlisted");
    }

    const ip = getRequestIp(req) || "unknown";
    await enforceRateLimit(`request-code:ip:${ip}`, {
      limit: env.rateLimit.maxRequests,
      windowSeconds: env.rateLimit.windowSeconds
    });
    await enforceRateLimit(`request-code:wallet:${normalizedWallet}`, {
      limit: env.rateLimit.maxRequests,
      windowSeconds: env.rateLimit.windowSeconds
    });

    const { digest: emailLookupHmac } = createLookupHmac(normalizedEmail, env.activePepperKeyId);
    const { digest: walletLookupHmac } = createLookupHmac(normalizedWallet, env.activePepperKeyId);
    await enforceRateLimit(`request-code:email:${emailLookupHmac.toString("hex")}`, {
      limit: env.rateLimit.maxRequests,
      windowSeconds: env.rateLimit.windowSeconds
    });

    const emailBytea = bufferToPgBytea(emailLookupHmac);
    const walletBytea = bufferToPgBytea(walletLookupHmac);
    const supabase = getSupabaseClient();

    const existingEmail = await supabase
      .from("verified_users")
      .select("status")
      .eq("email_lookup_hmac", emailBytea)
      .maybeSingle();

    if (existingEmail.data) {
      return res.status(200).json({ success: true });
    }

    const existingWallet = await supabase
      .from("verified_users")
      .select("status")
      .eq("wallet_lookup_hmac", walletBytea)
      .maybeSingle();

    if (existingWallet.data) {
      return res.status(200).json({ success: true });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + env.codeExpiryMinutes * 60 * 1000).toISOString();
    const codeHash = await hashVerificationCode(code, emailLookupHmac);
    const codeHashBytea = bufferToPgBytea(Buffer.from(codeHash, "utf8"));
    const ipHash = hashIpAddress(ip);

    await supabase.from("email_verification_codes").delete().eq("email_lookup_hmac", emailBytea);

    const insertResult = await supabase.from("email_verification_codes").insert({
      email_lookup_hmac: emailBytea,
      code_hash: codeHashBytea,
      code_expires_at: expiresAt,
      created_ip_hash: ipHash ? bufferToPgBytea(ipHash) : null
    });

    if (insertResult.error) {
      throw new HttpError("Failed to store verification code", { details: insertResult.error });
    }

    const expiresDisplay = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul"
    }).format(new Date(expiresAt));

    await sendVerificationEmail({ to: normalizedEmail, code, expiresAt: expiresDisplay });

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/request-code error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
