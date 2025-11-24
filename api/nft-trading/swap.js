import { z } from "zod";
import { getSupabaseClient } from "../_lib/supabase.js";
import { enforceRateLimit } from "../_lib/rate-limit.js";
import { HttpError, RateLimitError, ValidationError } from "../_lib/errors.js";
import {
  applyCors,
  ensureOwner,
  assertTxForEscrow,
  normalizeTxHash,
  normalizeWalletHeader,
  toDbWallet
} from "./_lib.js";

const schema = z.object({
  myDepositId: z.coerce.number().int().positive(),
  targetDepositId: z.coerce.number().int().positive(),
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
    await enforceRateLimit(`swap:${requester.toLowerCase()}`);

    const parsed = schema.parse(req.body);
    if (parsed.myDepositId === parsed.targetDepositId) {
      throw new ValidationError("myDepositId and targetDepositId must differ");
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("deposits")
      .select("*")
      .in("id", [parsed.myDepositId, parsed.targetDepositId]);

    if (error) {
      throw new HttpError("Failed to fetch deposits", { details: error });
    }

    const myDeposit = data?.find((row) => row.id === parsed.myDepositId);
    const targetDeposit = data?.find((row) => row.id === parsed.targetDepositId);

    if (!myDeposit || !targetDeposit) {
      throw new HttpError("Deposit not found", { status: 404, code: "NOT_FOUND" });
    }

    ensureOwner(myDeposit.owner_wallet, requester);

    if (myDeposit.status !== "ACTIVE" || targetDeposit.status !== "ACTIVE") {
      throw new HttpError("Inactive deposit", { status: 409, code: "INACTIVE_DEPOSIT" });
    }

    const initiator = toDbWallet(requester);
    const counterparty = toDbWallet(targetDeposit.owner_wallet);
    const txHash = normalizeTxHash(parsed.txHash, "txHash");

    await assertTxForEscrow({ txHash, expectedFrom: requester });

    // Update owners to reflect swap (best-effort; assumes on-chain swap succeeded)
    const { error: upsertError } = await supabase.from("deposits").upsert(
      [
        {
          ...myDeposit,
          owner_wallet: targetDeposit.owner_wallet,
          status: "ACTIVE"
        },
        {
          ...targetDeposit,
          owner_wallet: myDeposit.owner_wallet,
          status: "ACTIVE"
        }
      ],
      { onConflict: "id" }
    );

    if (upsertError) {
      throw new HttpError("Failed to record swap", { details: upsertError });
    }

    const { error: swapError } = await supabase.from("swap_events").insert({
      initiator,
      counterparty,
      my_deposit_id: parsed.myDepositId,
      target_deposit_id: parsed.targetDepositId,
      tx_hash: txHash
    });

    if (swapError) {
      throw new HttpError("Failed to persist swap event", { details: swapError });
    }

    return res.status(200).json({ swapped: true });
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

  console.error("/api/nft-trading/swap error", error);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}
