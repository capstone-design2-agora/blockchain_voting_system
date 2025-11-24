import crypto from "node:crypto";
import { z } from "zod";
import { Wallet, solidityPackedKeccak256 } from "ethers";
import { getEnv } from "../api-lib/env.js";
import { getSupabaseClient } from "../api-lib/supabase.js";
import {
  normalizeEmail,
  normalizeWalletAddress,
  createLookupHmac,
  verifyCodeHash,
  deriveSlowHash,
  createIdentityHash,
  encryptRetryPayload,
  nonceToBytes32
} from "./_lib/crypto.js";
import { bufferToPgBytea, pgByteaToBuffer, bufferToHex, hexToBuffer } from "../api-lib/bytea.js";
import { readJsonBody } from "../api-lib/request.js";
import { ValidationError, HttpError } from "../api-lib/errors.js";

const env = getEnv();
const signer = new Wallet(env.verifierPrivateKey);

const schema = z.object({
  email: z.string().email(),
  walletAddress: z.string().min(1),
  code: z.string().regex(/^\d{6}$/)
});

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const { email, walletAddress, code } = schema.parse(body);

    const normalizedEmail = normalizeEmail(email);
    let normalizedWallet;
    try {
      normalizedWallet = normalizeWalletAddress(walletAddress);
    } catch {
      throw new ValidationError("Invalid wallet address");
    }
    const supabase = getSupabaseClient();

    const { digest: emailLookupHmac } = createLookupHmac(normalizedEmail, env.activePepperKeyId);
    const { digest: walletLookupHmac } = createLookupHmac(normalizedWallet, env.activePepperKeyId);
    const emailBytea = bufferToPgBytea(emailLookupHmac);
    const walletBytea = bufferToPgBytea(walletLookupHmac);

    const codeResult = await supabase
      .from("email_verification_codes")
      .select("id, code_hash, code_expires_at, attempt_count")
      .eq("email_lookup_hmac", emailBytea)
      .maybeSingle();

    if (codeResult.error) {
      throw new HttpError("Failed to load verification code", { details: codeResult.error });
    }

    const codeRow = codeResult.data;
    if (!codeRow) {
      throw new ValidationError("Invalid or expired code");
    }

    if (codeRow.attempt_count >= env.maxVerificationAttempts) {
      await supabase.from("email_verification_codes").delete().eq("id", codeRow.id);
      throw new ValidationError("Too many attempts");
    }

    const expiresAt = new Date(codeRow.code_expires_at);
    if (expiresAt.getTime() < Date.now()) {
      await supabase.from("email_verification_codes").delete().eq("id", codeRow.id);
      throw new ValidationError("Verification code expired");
    }

    const attemptUpdate = await supabase
      .from("email_verification_codes")
      .update({ attempt_count: codeRow.attempt_count + 1 })
      .eq("id", codeRow.id);

    if (attemptUpdate.error) {
      throw new HttpError("Failed to track verification attempts", { details: attemptUpdate.error });
    }

    const storedHashBuffer = pgByteaToBuffer(codeRow.code_hash);
    const storedHash = storedHashBuffer?.toString("utf8");
    const isValid = await verifyCodeHash(storedHash, code, emailLookupHmac);

    if (!isValid) {
      throw new ValidationError("Invalid or expired code");
    }

    const userResult = await supabase
      .from("verified_users")
      .select(
        "email_lookup_hmac, wallet_lookup_hmac, email_hash_slow, email_hash_slow_salt, wallet_hash_slow, wallet_hash_slow_salt, nonce, status"
      )
      .eq("email_lookup_hmac", emailBytea)
      .maybeSingle();

    if (userResult.error) {
      throw new HttpError("Failed to load verification state", { details: userResult.error });
    }

    const existingUser = userResult.data;
    if (existingUser?.status === "COMPLETED") {
      return res.status(200).json({ success: true, status: "COMPLETED" });
    }

    const emailSalt = existingUser?.email_hash_slow_salt ? pgByteaToBuffer(existingUser.email_hash_slow_salt) : undefined;
    const walletSalt = existingUser?.wallet_hash_slow_salt ? pgByteaToBuffer(existingUser.wallet_hash_slow_salt) : undefined;

    const emailSlow = await deriveSlowHash(normalizedEmail, emailSalt);
    const walletSlow = await deriveSlowHash(normalizedWallet, walletSalt);
    const nonce = existingUser?.nonce || crypto.randomUUID();
    const identityHash = createIdentityHash(emailLookupHmac, walletLookupHmac);
    const nonceBytes = nonceToBytes32(nonce);
    const signingDigest = solidityPackedKeccak256(
      ["bytes32", "address", "uint256", "bytes32"],
      [identityHash, normalizedWallet, env.chainId, bufferToHex(nonceBytes)]
    );
    const signatureBytes = await signer.signMessage(Buffer.from(signingDigest.slice(2), "hex"));
    const signatureBuffer = Buffer.from(signatureBytes.replace(/^0x/, ""), "hex");
    const identityBuffer = hexToBuffer(identityHash);
    const retryPayload = encryptRetryPayload({ signature: signatureBytes, identityHash, nonce });

    const upsertResult = await supabase
      .from("verified_users")
      .upsert(
        {
          email_lookup_hmac: emailBytea,
          wallet_lookup_hmac: walletBytea,
          email_hash_slow: bufferToPgBytea(emailSlow.hash),
          email_hash_slow_salt: bufferToPgBytea(emailSlow.salt),
          wallet_hash_slow: bufferToPgBytea(walletSlow.hash),
          wallet_hash_slow_salt: bufferToPgBytea(walletSlow.salt),
          pepper_key_id: env.activePepperKeyId,
          status: "PENDING",
          signature: bufferToPgBytea(signatureBuffer),
          identity_hash: bufferToPgBytea(identityBuffer),
          retry_payload_enc: bufferToPgBytea(retryPayload),
          nonce,
          tx_hash: null,
          completed_at: null
        },
        { onConflict: "email_lookup_hmac" }
      )
      .select("nonce")
      .single();

    if (upsertResult.error) {
      throw new HttpError("Failed to persist verification state", { details: upsertResult.error });
    }

    const deleteResult = await supabase.from("email_verification_codes").delete().eq("id", codeRow.id);
    if (deleteResult.error) {
      console.warn("Failed to delete consumed verification code", deleteResult.error);
    }

    const expiresAtIso = new Date(Date.now() + env.signatureTtlMinutes * 60 * 1000).toISOString();

    return res.status(200).json({
      success: true,
      status: "PENDING",
      signature: signatureBytes,
      identityHash,
      nonce,
      expiresAt: expiresAtIso
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/verify-and-sign error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
