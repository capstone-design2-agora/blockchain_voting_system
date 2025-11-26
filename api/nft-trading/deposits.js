import { z } from "zod";
import { getSupabaseClient } from "../_lib/supabase.js";

const querySchema = z.object({
  status: z.string().optional(),
  owner: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  cursor: z.string().optional(), // ISO date cursor (created_at)
});

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { status, owner, limit = 20, cursor } = querySchema.parse(req.query);
    const supabase = getSupabaseClient();
    let query = supabase
      .from("deposits")
      .select(
        "id, owner_wallet, nft_contract, token_id, status, tx_hash, created_at, required_ballot_id, required_grade",
        { count: "estimated" }
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status.toUpperCase());
    }
    if (owner) {
      query = query.ilike("owner_wallet", owner);
    }
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;
    return res.status(200).json({ deposits: data ?? [], nextCursor });
  } catch (error) {
    console.error("/api/nft-trading/deposits error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
