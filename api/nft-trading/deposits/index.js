import { z } from "zod";
import { getSupabaseClient } from "../../../api-lib/supabase.js";
import { enforceRateLimit } from "../../../api-lib/rate-limit.js";
import { HttpError, RateLimitError, ValidationError } from "../../../api-lib/errors.js";
import {
  applyCors,
  ensureOwner,
  getClientIp,
  normalizeContractAddress,
  normalizeTxHash,
  normalizeWallet,
  normalizeWalletHeader,
  toDbWallet
} from "../_lib.js";

const listSchema = z.object({
  status: z.enum(["ACTIVE", "WITHDRAWN"]).default("ACTIVE"),
  owner: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const createSchema = z.object({
  depositId: z.coerce.number().int().positive(),
  nftContract: z.string(),
  tokenId: z.string().min(1),
  txHash: z.string().optional()
});

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) {
    return;
  }

  try {
    if (req.method === "GET") {
      return await handleList(req, res);
    }
    if (req.method === "POST") {
      return await handleCreate(req, res);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  } catch (error) {
    return sendError(res, error);
  }
}

async function handleList(req, res) {
  const parsed = listSchema.parse({
    status: req.query.status ?? "ACTIVE",
    owner: req.query.owner,
    limit: req.query.limit,
    offset: req.query.offset
  });

  const supabase = getSupabaseClient();

  let normalizedOwner = null;
  if (parsed.owner) {
    normalizedOwner = normalizeWallet(parsed.owner, "owner");
  }

  if (parsed.status === "WITHDRAWN" && !normalizedOwner) {
    throw new ValidationError("Owner is required when querying WITHDRAWN deposits");
  }

  const requester = normalizedOwner ? normalizeWalletHeader(req, { required: true }) : null;
  if (normalizedOwner && requester) {
    ensureOwner(toDbWallet(normalizedOwner), requester);
  }

  const rateLimitKey = normalizedOwner ? `deposits:${normalizedOwner.toLowerCase()}` : `deposits:anon:${getClientIp(req)}`;
  await enforceRateLimit(rateLimitKey);

  let query = supabase
    .from("deposits")
    .select("*")
    .eq("status", parsed.status)
    .order("created_at", { ascending: false })
    .range(parsed.offset, parsed.offset + parsed.limit - 1);

  if (normalizedOwner) {
    query = query.eq("owner_wallet", toDbWallet(normalizedOwner));
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError("Failed to fetch deposits", { details: error });
  }

  return res.status(200).json({ deposits: data ?? [] });
}

async function handleCreate(req, res) {
  const requester = normalizeWalletHeader(req, { required: true });
  await enforceRateLimit(`deposits:create:${requester.toLowerCase()}`);

  const parsed = createSchema.parse(req.body);
  const nftContract = normalizeContractAddress(parsed.nftContract);
  const txHash = normalizeTxHash(parsed.txHash);
  const owner = toDbWallet(requester);

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("deposits").upsert(
    {
      id: parsed.depositId,
      owner_wallet: owner,
      nft_contract: nftContract,
      token_id: parsed.tokenId,
      status: "ACTIVE",
      tx_hash: txHash
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new HttpError("Failed to upsert deposit", { details: error });
  }

  return res.status(200).json({ depositId: parsed.depositId });
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

  console.error("/api/nft-trading/deposits error", error);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
}
