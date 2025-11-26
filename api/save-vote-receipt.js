import { z } from "zod";
import { ethers } from "ethers";
import { getSupabaseClient } from "./_lib/supabase.js";
import { readJsonBody } from "./_lib/request.js";
import { ValidationError, HttpError } from "./_lib/errors.js";

const schema = z.object({
  walletAddress: z.string().min(1),
  ballotId: z.string().min(1),
  proposalId: z.number().int().nonnegative(),
  txHash: z.string().min(1),
  blockNumber: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  chainId: z.string().optional(),
  rawReceipt: z.any().optional(),
  signature: z.string().min(1).optional(),
});

function buildSignedMessage(payload) {
  // 인코딩 규칙을 고정해 서명 검증 시 동일한 문자열이 사용되도록 한다.
  return [
    "Vote receipt",
    `address:${payload.walletAddress}`,
    `ballot:${payload.ballotId}`,
    `proposal:${payload.proposalId}`,
    `tx:${payload.txHash}`,
  ].join("\n");
}

export default async function handler(req, res) {
  // CORS
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid payload", parsed.error.flatten());
    }
    const payload = parsed.data;

    // 서명 검증 (선택적)
    if (payload.signature) {
      const message = buildSignedMessage(payload);
      let recovered;
      try {
        recovered = ethers.verifyMessage(message, payload.signature);
      } catch (err) {
        throw new ValidationError("Invalid signature format");
      }

      if (recovered.toLowerCase() !== payload.walletAddress.toLowerCase()) {
        throw new ValidationError("Signature does not match walletAddress");
      }
    }

    // 저장
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("vote_receipts")
      .upsert(
        {
          wallet_address: payload.walletAddress,
          ballot_id: payload.ballotId,
          proposal_id: payload.proposalId,
          tx_hash: payload.txHash,
          block_number: payload.blockNumber ?? null,
          status: payload.status ?? "success",
          chain_id: payload.chainId ?? null,
          raw_receipt: payload.rawReceipt ?? null,
        },
        { onConflict: "wallet_address,ballot_id" }
      );

    if (error) {
      throw new HttpError("Failed to persist vote receipt", { details: error });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/save-vote-receipt error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
