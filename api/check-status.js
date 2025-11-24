import { z } from "zod";
import { getSupabaseClient } from "../api-lib/supabase.js";
import { normalizeWalletAddress, createLookupHmac, decryptRetryPayload } from "../api-lib/crypto.js";
import { bufferToPgBytea, pgByteaToBuffer, bufferToHex } from "../api-lib/bytea.js";
import { ValidationError, HttpError } from "../api-lib/errors.js";

const schema = z.object({
  wallet: z.string().min(1)
});

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { wallet } = schema.parse(req.query);
    let normalizedWallet;
    try {
      normalizedWallet = normalizeWalletAddress(wallet);
    } catch {
      throw new ValidationError("Invalid wallet address");
    }
    const { digest: walletLookupHmac } = createLookupHmac(normalizedWallet);
    const walletBytea = bufferToPgBytea(walletLookupHmac);

    const supabase = getSupabaseClient();
    const result = await supabase
      .from("verified_users")
      .select("status, signature, identity_hash, retry_payload_enc, nonce, tx_hash, completed_at")
      .eq("wallet_lookup_hmac", walletBytea)
      .maybeSingle();

    if (result.error) {
      throw new HttpError("Failed to fetch verification status", { details: result.error });
    }

    const row = result.data;
    if (!row) {
      return res.status(200).json({ status: "NOT_FOUND" });
    }

    if (row.status === "COMPLETED") {
      return res.status(200).json({
        status: "COMPLETED",
        txHash: row.tx_hash ? bufferToHex(pgByteaToBuffer(row.tx_hash)) : null,
        completedAt: row.completed_at
      });
    }

    const retryPayload = row.retry_payload_enc ? decryptRetryPayload(pgByteaToBuffer(row.retry_payload_enc)) : null;

    return res.status(200).json({
      status: row.status,
      signature: retryPayload?.signature,
      identityHash: retryPayload?.identityHash,
      nonce: retryPayload?.nonce || row.nonce
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/check-status error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
