import { z } from "zod";
import { getSupabaseClient } from "../_lib/supabase.js";
import { enforceRateLimit } from "../_lib/rate-limit.js";
import { HttpError, RateLimitError, ValidationError } from "../_lib/errors.js";
import { applyCors, assertTxForEscrow, ensureOwner, normalizeTxHash, normalizeWalletHeader } from "./_lib.js";

const schema = z.object({
  depositId: z.coerce.number().int().positive(),
  txHash: z.string().min(1)
});

export default async function handler(req, res) {
  if (applyCors(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const requester = normalizeWalletHeader(req, { required: true });
    await enforceRateLimit(`withdraw:${requester.toLowerCase()}`);

    const parsed = schema.parse(req.body);
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from("deposits").select("*").eq("id", parsed.depositId).maybeSingle();

    if (error) {
      throw new HttpError("Failed to fetch deposit", { details: error });
    }

    if (!data) {
      throw new HttpError("Deposit not found", { status: 404, code: "NOT_FOUND" });
    }

    ensureOwner(data.owner_wallet, requester);

    if (data.status !== "ACTIVE") {
      throw new HttpError("Inactive deposit", { status: 409, code: "INACTIVE_DEPOSIT" });
    }

    const txHash = normalizeTxHash(parsed.txHash, "txHash");
    await assertTxForEscrow({ txHash, expectedFrom: requester });

    const { error: updateError } = await supabase
      .from("deposits")
      .update({ status: "WITHDRAWN", tx_hash: txHash || data.tx_hash })
      .eq("id", parsed.depositId);

    if (updateError) {
      throw new HttpError("Failed to mark withdrawn", { details: updateError });
    }

    return res.status(200).json({ withdrawn: true });
  } catch (error) {
    return sendError(res, error);
  }
}

function sendError(res, error) {
  if (error instanceof ValidationError || error instanceof HttpError || error instanceof RateLimitError) {
    if (error.retryAt) {
      res.setHeader("Retry-After", error.retryAt);
    }
    return res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details
    });
  }

  console.error("/api/nft-trading/withdraw error", error);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}
