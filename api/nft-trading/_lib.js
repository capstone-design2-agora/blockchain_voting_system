import { getAddress, JsonRpcProvider } from "ethers";
import { normalizeWalletAddress } from "../../api-lib/crypto.js";
import { HttpError, UnauthorizedError, ValidationError } from "../../api-lib/errors.js";

let cachedProvider;

export function applyCors(req, res, methods = ["GET", "POST", "OPTIONS"]) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-wallet-address, x-wallet");
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", methods.join(", "));
    res.status(200).end();
    return true;
  }
  return false;
}

export function normalizeWalletHeader(req, { required = true } = {}) {
  const wallet = req.headers["x-wallet-address"] || req.headers["x-wallet"];
  if (!wallet) {
    if (required) {
      throw new UnauthorizedError("Missing x-wallet-address header");
    }
    return null;
  }
  return normalizeWalletAddress(wallet);
}

export function normalizeWallet(value, label = "wallet") {
  try {
    return normalizeWalletAddress(value);
  } catch {
    throw new ValidationError(`Invalid ${label}`);
  }
}

export function normalizeContractAddress(value) {
  try {
    return getAddress(value).toLowerCase();
  } catch {
    throw new ValidationError("Invalid nftContract");
  }
}

export function normalizeTxHash(value, field = "txHash") {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new ValidationError(`Invalid ${field}`);
  }
  return normalized;
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || "";
}

export function toDbWallet(address) {
  return address.toLowerCase();
}

export function ensureOwner(ownerWallet, requesterWallet) {
  if (!requesterWallet) {
    throw new UnauthorizedError("Missing wallet");
  }
  if (ownerWallet?.toLowerCase() !== requesterWallet.toLowerCase()) {
    throw new HttpError("NOT_OWNER", { status: 403, code: "NOT_OWNER" });
  }
}

export function getEscrowConfig() {
  const addr = process.env.ESCROW_ADDRESS || process.env.REACT_APP_ESCROW_ADDRESS;
  const rpcUrl = process.env.RPC_WS_URL || process.env.RPC_URL;
  if (!addr) {
    throw new Error("ESCROW_ADDRESS is required for on-chain validation");
  }
  if (!rpcUrl) {
    throw new Error("RPC_URL or RPC_WS_URL is required for on-chain validation");
  }
  return { escrowAddress: getAddress(addr).toLowerCase(), rpcUrl };
}

export function getRpcProvider() {
  if (cachedProvider) return cachedProvider;
  const { rpcUrl } = getEscrowConfig();
  cachedProvider = new JsonRpcProvider(rpcUrl);
  return cachedProvider;
}

export async function assertTxForEscrow({ txHash, expectedFrom }) {
  const { escrowAddress } = getEscrowConfig();
  const provider = getRpcProvider();

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new HttpError("Transaction not found", { status: 404, code: "TX_NOT_FOUND" });
  }
  if (!tx.to || tx.to.toLowerCase() !== escrowAddress) {
    throw new HttpError("TX_TO_MISMATCH", { status: 400, code: "TX_TO_MISMATCH" });
  }
  if (!tx.blockNumber) {
    throw new HttpError("Transaction not mined", { status: 409, code: "TX_NOT_MINED" });
  }
  if (expectedFrom && tx.from?.toLowerCase() !== expectedFrom.toLowerCase()) {
    throw new HttpError("TX_SENDER_MISMATCH", { status: 403, code: "TX_SENDER_MISMATCH" });
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    throw new HttpError("On-chain revert", { status: 502, code: "ONCHAIN_REVERT" });
  }

  return { tx, receipt };
}
