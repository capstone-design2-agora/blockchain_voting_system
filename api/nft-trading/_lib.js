import { getAddress } from "ethers";
import { normalizeWalletAddress } from "../_lib/crypto.js";
import { HttpError, UnauthorizedError, ValidationError } from "../_lib/errors.js";

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
