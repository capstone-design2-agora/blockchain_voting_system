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
  const fromBlock = state?.lastProcessedBlock != null ? state.lastProcessedBlock + 1 : env.startBlock || latest;
  const toBlock = latest;

  console.log(`[escrow-indexer] scanning blocks ${fromBlock} -> ${toBlock}`);
  if (toBlock < fromBlock) {
    console.log("Nothing to do.");
    return;
  }

  const events = await contract.queryFilter({}, fromBlock, toBlock);
  console.log(`[escrow-indexer] found ${events.length} events`);

  for (const ev of events) {
    if (ev.event === "Deposited") {
      const depositId = ev.args?.depositId?.toString();
      await supabase.from("deposits").upsert({
        id: depositId,
        owner_wallet: ev.args.owner,
        nft_contract: ev.args.nft,
        token_id: ev.args.tokenId.toString(),
        status: "ACTIVE",
        tx_hash: ev.transactionHash,
      });
      console.log(`Upsert deposit ${depositId} ACTIVE`);
    } else if (ev.event === "Withdrawn") {
      const depositId = ev.args?.depositId?.toString();
      await supabase.from("deposits").upsert({
        id: depositId,
        status: "WITHDRAWN",
        tx_hash: ev.transactionHash,
      });
      console.log(`Mark deposit ${depositId} WITHDRAWN`);
    } else if (ev.event === "Swapped") {
      const targetId = ev.args?.targetDepositId?.toString();
      const takerDepositId = ev.args?.takerDepositId?.toString();
      const taker = ev.args?.taker;
      const targetOwner = ev.args?.targetOwner;
      await supabase.from("deposits").upsert([
        { id: targetId, status: "CLOSED", tx_hash: ev.transactionHash },
        { id: takerDepositId, status: "CLOSED", tx_hash: ev.transactionHash },
      ]);
      await supabase.from("swap_events").insert({
        initiator: taker,
        counterparty: targetOwner,
        my_deposit_id: takerDepositId,
        target_deposit_id: targetId,
        tx_hash: ev.transactionHash,
      });
      console.log(`Swap target ${targetId} with taker ${takerDepositId}`);
    }
  }

  saveState({ lastProcessedBlock: toBlock });
  console.log(`[escrow-indexer] done. saved state at block ${toBlock}`);
}

main().catch((err) => {
  console.error("[escrow-indexer] failed:", err);
  process.exit(1);
});
