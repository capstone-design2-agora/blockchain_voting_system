import { z } from "zod";
import { getSupabaseClient } from "./_lib/supabase.js";
import { ValidationError, HttpError } from "./_lib/errors.js";

const querySchema = z.object({
  walletAddress: z.string().min(1, "walletAddress is required"),
  ballotId: z.string().min(1, "ballotId is required"),
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      throw new ValidationError("Invalid query", parsed.error.flatten());
    }
    const { walletAddress, ballotId } = parsed.data;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("vote_receipts")
      .select(
        "wallet_address,ballot_id,proposal_id,tx_hash,block_number,status,chain_id,raw_receipt"
      )
      .ilike("wallet_address", walletAddress)
      .eq("ballot_id", ballotId)
      .maybeSingle();

    if (error) {
      throw new HttpError("Failed to fetch vote receipt", {
        details: error,
      });
    }

    if (!data) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    return res.status(200).json({ receipt: data });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    if (error instanceof HttpError) {
      return res
        .status(error.status)
        .json({ error: error.code, message: error.message, details: error.details });
    }
    console.error("/api/get-vote-receipt error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
