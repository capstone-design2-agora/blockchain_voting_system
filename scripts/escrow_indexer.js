#!/usr/bin/env node
/**
 * Lightweight escrow indexer.
 * - Reads SimpleNFTEscrow events from RPC.
 * - Upserts Supabase tables: deposits, swap_events.
 * - Persists last processed block to scripts/.escrow_indexer_state.json.
 *
 * Env:
 *  RPC_URL
 *  SIMPLE_ESCROW_ADDRESS
 *  SUPABASE_URL
 *  SUPABASE_SERVICE_KEY
 *  START_BLOCK (optional, number)
 */

const { createClient } = require("@supabase/supabase-js");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, ".escrow_indexer_state.json");
const ARTIFACT = require("../blockchain_contracts/hardhat/artifacts/contracts/SimpleNFTEscrow.sol/SimpleNFTEscrow.json");

function getEnv() {
  const {
    RPC_URL,
    SIMPLE_ESCROW_ADDRESS,
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    START_BLOCK,
  } = process.env;
  if (!RPC_URL || !SIMPLE_ESCROW_ADDRESS || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Missing env. Required: RPC_URL, SIMPLE_ESCROW_ADDRESS, SUPABASE_URL, SUPABASE_SERVICE_KEY");
  }
  return {
    rpcUrl: RPC_URL,
    escrowAddress: SIMPLE_ESCROW_ADDRESS,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_SERVICE_KEY,
    startBlock: START_BLOCK ? Number(START_BLOCK) : null,
  };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveState(data) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  const env = getEnv();
  const provider = new ethers.JsonRpcProvider(env.rpcUrl);
  const supabase = createClient(env.supabaseUrl, env.supabaseKey);
  const contract = new ethers.Contract(env.escrowAddress, ARTIFACT.abi, provider);

  const state = loadState();
  const latest = await provider.getBlockNumber();
  // Respect START_BLOCK=0; only fall back to latest when startBlock is null/undefined.
  const fromBlock = state?.lastProcessedBlock != null
    ? state.lastProcessedBlock + 1
    : (env.startBlock ?? latest);
  const toBlock = latest;

  console.log(`[escrow-indexer] scanning blocks ${fromBlock} -> ${toBlock}`);
  if (toBlock < fromBlock) {
    console.log("Nothing to do.");
    return;
  }

  const depositedLogs = await contract.queryFilter(contract.filters.Deposited(), fromBlock, toBlock);
  const withdrawnLogs = await contract.queryFilter(contract.filters.Withdrawn(), fromBlock, toBlock);
  const swappedLogs = await contract.queryFilter(contract.filters.Swapped(), fromBlock, toBlock);
  const events = [...depositedLogs, ...withdrawnLogs, ...swappedLogs].sort(
    (a, b) => (a.blockNumber || 0) - (b.blockNumber || 0) || (a.index || 0) - (b.index || 0)
  );
  console.log(`[escrow-indexer] found ${events.length} events`);

  for (const ev of events) {
    const name = ev.fragment?.name || ev.eventName || ev.event; // ethers v6 compatibility
    if (name === "Deposited") {
      const depositId = ev.args?.depositId?.toString();
      const requiredBallotId = ev.args?.requiredBallotId ?? null;
      const requiredGradeRaw = ev.args?.requiredGrade;
      const requiredGrade =
        requiredGradeRaw === undefined || requiredGradeRaw === null ? null : Number(requiredGradeRaw);
      const { error } = await supabase.from("deposits").upsert({
        id: depositId,
        owner_wallet: ev.args.owner,
        nft_contract: ev.args.nft,
        token_id: ev.args.tokenId.toString(),
        status: "ACTIVE",
        tx_hash: ev.transactionHash,
        required_ballot_id: requiredBallotId,
        required_grade: requiredGrade,
      });
      if (error) {
        console.error(`Upsert deposit ${depositId} ACTIVE failed`, error);
      } else {
        console.log(`Upsert deposit ${depositId} ACTIVE`);
      }
    } else if (name === "Withdrawn") {
      const depositId = ev.args?.depositId?.toString();
      const { error } = await supabase
        .from("deposits")
        .update({ status: "WITHDRAWN", tx_hash: ev.transactionHash })
        .eq("id", depositId);
      if (error) {
        console.error(`Mark deposit ${depositId} WITHDRAWN failed`, error);
      } else {
        console.log(`Mark deposit ${depositId} WITHDRAWN`);
      }
    } else if (name === "Swapped") {
      const targetId = ev.args?.targetDepositId?.toString();
      const takerDepositId = ev.args?.takerDepositId?.toString();
      const taker = ev.args?.taker;
      const targetOwner = ev.args?.targetOwner;
      const { error: depErr } = await supabase
        .from("deposits")
        .update({ status: "CLOSED", tx_hash: ev.transactionHash })
        .in("id", [targetId, takerDepositId]);
      const { error: swapErr } = await supabase.from("swap_events").insert({
        initiator: taker,
        counterparty: targetOwner,
        my_deposit_id: takerDepositId,
        target_deposit_id: targetId,
        tx_hash: ev.transactionHash,
      });
      if (depErr || swapErr) {
        console.error(`Swap event upsert failed`, depErr || swapErr);
      } else {
        console.log(`Swap target ${targetId} with taker ${takerDepositId}`);
      }
    } else {
      console.log(`Skipping unknown event ${name || "<no-name>"} at block ${ev.blockNumber}`);
    }
  }

  saveState({ lastProcessedBlock: toBlock });
  console.log(`[escrow-indexer] done. saved state at block ${toBlock}`);
}

async function runForever() {
  console.log("[escrow-indexer] Starting continuous indexing...");
  while (true) {
    try {
      await main();
    } catch (err) {
      console.error("[escrow-indexer] Error in loop:", err);
    }
    // Wait 1 second before next run
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

runForever().catch((err) => {
  console.error("[escrow-indexer] Fatal error:", err);
  process.exit(1);
});
