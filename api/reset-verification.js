import { z } from "zod";
import { getEnv } from "../api-lib/env.js";
import { getSupabaseClient } from "../api-lib/supabase.js";
import {
  normalizeEmail,
  normalizeWalletAddress,
  createLookupHmac
} from "../api-lib/crypto.js";
import { bufferToPgBytea } from "../api-lib/bytea.js";
import { readJsonBody } from "../api-lib/request.js";
import { ValidationError, HttpError } from "../api-lib/errors.js";

const schema = z.object({
  email: z.string().email(),
  walletAddress: z.string().min(1)
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const { email, walletAddress } = schema.parse(body);
    const env = getEnv();

    const normalizedEmail = normalizeEmail(email);
    let normalizedWallet;
    try {
      normalizedWallet = normalizeWalletAddress(walletAddress);
    } catch {
      throw new ValidationError("Invalid wallet address");
    }

    const { digest: emailLookupHmac } = createLookupHmac(normalizedEmail, env.activePepperKeyId);
    const { digest: walletLookupHmac } = createLookupHmac(normalizedWallet, env.activePepperKeyId);
    const emailBytea = bufferToPgBytea(emailLookupHmac);
    const walletBytea = bufferToPgBytea(walletLookupHmac);

    const supabase = getSupabaseClient();

    const [codeDelete, userByEmailDelete, userByWalletDelete] = await Promise.all([
      supabase.from("email_verification_codes").delete().eq("email_lookup_hmac", emailBytea),
      supabase.from("verified_users").delete().eq("email_lookup_hmac", emailBytea),
      supabase.from("verified_users").delete().eq("wallet_lookup_hmac", walletBytea)
    ]);

    if (codeDelete.error) {
      throw new HttpError("Failed to clear verification codes", { details: codeDelete.error });
    }
    if (userByEmailDelete.error) {
      throw new HttpError("Failed to clear verification records", { details: userByEmailDelete.error });
    }
    if (userByWalletDelete.error) {
      throw new HttpError("Failed to clear wallet verification records", { details: userByWalletDelete.error });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/reset-verification error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
