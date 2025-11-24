#!/usr/bin/env node

/**
 * Minimal NFTEscrow indexer: listens for Deposited/Swapped/Withdrawn and mirrors them into Supabase.
 * Assumptions:
 * - Transactions are already mined; this worker only mirrors on-chain state to `deposits`/`swap_events`.
 * - RLS permits service role writes (use SUPABASE_SERVICE_ROLE_KEY).
 *
 * Required env:
 *   ESCROW_ADDRESS
 *   RPC_WS_URL
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   START_BLOCK (number) – fallback if no cursor file exists
 *   CURSOR_PATH – default: .cache/escrow_cursor.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const RPC_WS_URL = process.env.RPC_WS_URL || process.env.RPC_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const START_BLOCK = process.env.START_BLOCK ? Number.parseInt(process.env.START_BLOCK, 10) : undefined;
const CURSOR_PATH = process.env.CURSOR_PATH || path.join(__dirname, "..", ".cache", "escrow_cursor.json");

if (!ESCROW_ADDRESS || !RPC_WS_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required env: ESCROW_ADDRESS, RPC_WS_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

function loadAbi() {
  const candidates = [
    path.join(__dirname, "..", "frontend", "src", "abi", "NFTEscrow.json"),
    path.join(__dirname, "..", "blockchain_contracts", "hardhat", "artifacts", "contracts", "NFTEscrow.sol", "NFTEscrow.json"),
    path.join(__dirname, "..", "blockchain_contracts", "artifacts", "contracts", "NFTEscrow.sol", "NFTEscrow.json")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
      return parsed.abi || parsed; // frontend copy is raw ABI array
    }
  }

  throw new Error("NFTEscrow ABI not found in expected locations.");
}

const abi = loadAbi();
const iface = new ethers.Interface(abi);
const provider = new ethers.WebSocketProvider(RPC_WS_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: { fetch },
  auth: { persistSession: false, autoRefreshToken: false }
});

function ensureCacheDir() {
  const dir = path.dirname(CURSOR_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readCursor() {
  try {
    const raw = fs.readFileSync(CURSOR_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Number.isFinite(parsed.lastBlock) ? parsed.lastBlock : undefined;
  } catch {
    return undefined;
  }
}

function writeCursor(blockNumber) {
  ensureCacheDir();
  fs.writeFileSync(CURSOR_PATH, JSON.stringify({ lastBlock: blockNumber }, null, 2));
}

async function upsertDeposit({ id, owner, nft, tokenId, txHash, status }) {
  const { error } = await supabase.from("deposits").upsert(
    {
      id,
      owner_wallet: owner.toLowerCase(),
      nft_contract: nft.toLowerCase(),
      token_id: tokenId.toString(),
      status,
      tx_hash: txHash
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("Failed to upsert deposit", { id, error });
  }
}

async function recordSwap({ myDepositId, targetDepositId, initiator, counterparty, txHash }) {
  const { error } = await supabase.from("swap_events").insert({
    my_deposit_id: myDepositId,
    target_deposit_id: targetDepositId,
    initiator: initiator.toLowerCase(),
    counterparty: counterparty.toLowerCase(),
    tx_hash: txHash
  });
  if (error) {
    console.error("Failed to insert swap event", { error });
  }
}

async function handleLog(log) {
  let parsed;
  try {
    parsed = iface.parseLog(log);
  } catch {
    return;
  }

  const txHash = log.transactionHash.toLowerCase();

  switch (parsed.name) {
    case "Deposited": {
      const { depositId, owner, nft, tokenId } = parsed.args;
      await upsertDeposit({
        id: Number(depositId),
        owner,
        nft,
        tokenId,
        txHash,
        status: "ACTIVE"
      });
      break;
    }
    case "Swapped": {
      const { myDepositId, targetDepositId, initiator, counterparty } = parsed.args;
      await recordSwap({
        myDepositId: Number(myDepositId),
        targetDepositId: Number(targetDepositId),
        initiator,
        counterparty,
        txHash
      });

      // Best-effort owner flip; indexer should reflect on-chain truth.
      const { data, error } = await supabase
        .from("deposits")
        .select("*")
        .in("id", [Number(myDepositId), Number(targetDepositId)]);

      if (!error && Array.isArray(data) && data.length === 2) {
        const mine = data.find((row) => row.id === Number(myDepositId));
        const theirs = data.find((row) => row.id === Number(targetDepositId));
        if (mine && theirs) {
          await supabase.from("deposits").upsert(
            [
              { ...mine, owner_wallet: theirs.owner_wallet, status: "ACTIVE", tx_hash: mine.tx_hash || txHash },
              { ...theirs, owner_wallet: mine.owner_wallet, status: "ACTIVE", tx_hash: theirs.tx_hash || txHash }
            ],
            { onConflict: "id" }
          );
        }
      }

      break;
    }
    case "Withdrawn": {
      const { depositId, owner } = parsed.args;
      const { error } = await supabase
        .from("deposits")
        .update({ status: "WITHDRAWN", tx_hash: txHash })
        .eq("id", Number(depositId));
      if (error) {
        console.error("Failed to mark withdrawn", { depositId: Number(depositId), error });
      }

      break;
    }
    default:
      break;
  }
}

async function catchUp(fromBlock) {
  const latest = await provider.getBlockNumber();
  if (fromBlock === undefined) {
    return latest;
  }

  if (fromBlock > latest) {
    return latest;
  }

  const logs = await provider.getLogs({
    address: ESCROW_ADDRESS,
    fromBlock,
    toBlock: latest
  });

  for (const log of logs) {
    await handleLog(log);
  }

  return latest;
}

async function main() {
  console.log("Starting NFTEscrow indexer...", { ESCROW_ADDRESS, RPC_WS_URL, CURSOR_PATH, START_BLOCK });

  const cursorBlock = readCursor();
  const startBlock = Number.isFinite(cursorBlock)
    ? cursorBlock
    : Number.isFinite(START_BLOCK)
      ? START_BLOCK
      : undefined;

  const syncedTo = await catchUp(startBlock);
  writeCursor(syncedTo);
  console.log(`Catch-up complete to block ${syncedTo}. Subscribing for new events...`);

  provider.on({ address: ESCROW_ADDRESS }, async (log) => {
    await handleLog(log);
    writeCursor(log.blockNumber);
  });

  if (provider._ws?.on) {
    provider._ws.on("close", (code) => {
      console.error("WebSocket closed", code);
      process.exit(1);
    });
  }
}

main().catch((err) => {
  console.error("Indexer failed", err);
  process.exit(1);
});
