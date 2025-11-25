import { z } from "zod";
import { getSupabaseClient } from "../_lib/supabase.js";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  cursor: z.string().optional(), // ISO date cursor (created_at)
  depositId: z.coerce.number().optional(),
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { limit = 20, cursor, depositId } = querySchema.parse(req.query);
    const supabase = getSupabaseClient();
    let query = supabase
      .from("swap_events")
      .select("id, initiator, counterparty, my_deposit_id, target_deposit_id, tx_hash, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (depositId) {
      query = query.or(`my_deposit_id.eq.${depositId},target_deposit_id.eq.${depositId}`);
    }
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    const nextCursor = data && data.length === limit ? data[data.length - 1].created_at : null;
    return res.status(200).json({ swapEvents: data ?? [], nextCursor });
  } catch (error) {
    console.error("/api/nft-trading/swap-events error", error);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}
