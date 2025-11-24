import { z } from "zod";
import { JsonRpcProvider } from "ethers";
import { getEnv } from "../api-lib/env.js";
import { getSupabaseClient } from "../api-lib/supabase.js";
import { normalizeWalletAddress, createLookupHmac } from "../api-lib/crypto.js";
import { bufferToPgBytea, hexToBuffer } from "../api-lib/bytea.js";
import { readJsonBody } from "../api-lib/request.js";
import { ValidationError, HttpError } from "../api-lib/errors.js";

const env = getEnv();
const provider = new JsonRpcProvider(env.rpcUrl);
const schema = z.object({
  walletAddress: z.string().min(1),
  txHash: z.string().regex(/^0x([0-9a-fA-F]{64})$/)
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
    const payload = await readJsonBody(req);
    const { walletAddress, txHash } = schema.parse(payload);

    let normalizedWallet;
    try {
      normalizedWallet = normalizeWalletAddress(walletAddress);
    } catch {
      throw new ValidationError("Invalid wallet address");
    }

    const { digest: walletLookupHmac } = createLookupHmac(normalizedWallet, env.activePepperKeyId);
    const walletBytea = bufferToPgBytea(walletLookupHmac);
    const supabase = getSupabaseClient();
    const rowResult = await supabase
      .from("verified_users")
      .select("status, nonce")
      .eq("wallet_lookup_hmac", walletBytea)
      .maybeSingle();

    if (rowResult.error) {
      throw new HttpError("Failed to fetch verification state", { details: rowResult.error });
    }

    const row = rowResult.data;
    if (!row) {
      throw new ValidationError("Verification record not found");
    }

    if (row.status !== "PENDING") {
      return res.status(200).json({ status: row.status });
    }

    console.log("[complete-verification] expecting target", env.citizenSbtContractAddress);

    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      throw new ValidationError("Transaction receipt not available yet");
    }

    if (receipt.status !== 1) {
      throw new ValidationError("Transaction failed on-chain");
    }

    if (receipt.from?.toLowerCase() !== normalizedWallet.toLowerCase()) {
      throw new ValidationError("Transaction wallet mismatch");
    }

    if (receipt.to?.toLowerCase() !== env.citizenSbtContractAddress.toLowerCase()) {
      console.warn("[complete-verification] target mismatch", {
        expected: env.citizenSbtContractAddress,
        actual: receipt.to,
        txHash
      });
      throw new ValidationError("Transaction target mismatch");
    }

    const updateResult = await supabase
      .from("verified_users")
      .update({
        status: "COMPLETED",
        tx_hash: bufferToPgBytea(hexToBuffer(txHash)),
        completed_at: new Date().toISOString(),
        signature: null,
        retry_payload_enc: null
      })
      .eq("wallet_lookup_hmac", walletBytea)
      .select("status, tx_hash, completed_at")
      .single();

    if (updateResult.error) {
      throw new HttpError("Failed to update verification record", { details: updateResult.error });
    }

    return res.status(200).json({
      status: updateResult.data.status,
      txHash: txHash,
      completedAt: updateResult.data.completed_at
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/complete-verification error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
