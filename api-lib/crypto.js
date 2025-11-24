import crypto from "node:crypto";
import argon2 from "argon2";
import { getAddress, solidityPackedKeccak256 } from "ethers";
import { bufferToHex } from "./bytea.js";
import { getEnv, getPepperValue } from "./env.js";

const CODE_HASH_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 2
};

const SLOW_HASH_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 96 * 1024,
  timeCost: 4,
  parallelism: 2,
  hashLength: 32,
  raw: true
};

let cachedAesKey;

function getAesKey() {
  if (cachedAesKey) return cachedAesKey;
  const { aesRetryKey } = getEnv();
  let key;
  try {
    key = Buffer.from(aesRetryKey, "base64");
  } catch {
    key = null;
  }
  if (!key || key.length === 0) {
    const normalized = aesRetryKey.startsWith("0x") ? aesRetryKey.slice(2) : aesRetryKey;
    key = Buffer.from(normalized, "hex");
  }
  if (key.length !== 32) {
    throw new Error("AES_RETRY_KEY must decode to 32 bytes for AES-256-GCM");
  }
  cachedAesKey = key;
  return key;
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase().normalize("NFKC");
}

export function normalizeWalletAddress(address) {
  return getAddress(address.trim());
}

export function isDomainAllowed(email, allowlist) {
  if (!allowlist || allowlist.length === 0) return true;
  const domain = email.split("@")[1];
  return allowlist.includes(domain);
}

export function createLookupHmac(value, pepperKeyId) {
  const env = getEnv();
  const keyId = (pepperKeyId || env.activePepperKeyId).toLowerCase();
  const pepper = getPepperValue(keyId);
  const digest = crypto.createHmac("sha256", pepper).update(Buffer.from(value, "utf8")).digest();
  return { digest, keyId };
}

export function hashIpAddress(ip) {
  if (!ip) return null;
  const { digest } = createLookupHmac(ip, getEnv().activePepperKeyId);
  return digest;
}

export async function hashVerificationCode(code, emailLookupHmacBuffer) {
  const combined = Buffer.concat([Buffer.from(code, "utf8"), emailLookupHmacBuffer]);
  return argon2.hash(combined, { ...CODE_HASH_PARAMS, raw: false });
}

export async function verifyCodeHash(storedHash, code, emailLookupHmacBuffer) {
  if (!storedHash) return false;
  const serialized = Buffer.isBuffer(storedHash) ? storedHash.toString("utf8") : String(storedHash);
  const combined = Buffer.concat([Buffer.from(code, "utf8"), emailLookupHmacBuffer]);
  try {
    return await argon2.verify(serialized, combined, CODE_HASH_PARAMS);
  } catch {
    return false;
  }
}

export async function deriveSlowHash(value, existingSalt) {
  const salt = existingSalt ?? crypto.randomBytes(16);
  const combined = Buffer.concat([Buffer.from(value, "utf8"), salt]);
  const hashBuffer = await argon2.hash(combined, SLOW_HASH_PARAMS);
  return { hash: Buffer.from(hashBuffer), salt };
}

export function createIdentityHash(emailLookupHmac, walletLookupHmac) {
  return solidityPackedKeccak256(["bytes32", "bytes32"], [bufferToHex(emailLookupHmac), bufferToHex(walletLookupHmac)]);
}

export function nonceToBytes32(nonce) {
  if (!nonce) {
    throw new Error("Nonce is required");
  }
  const hex = nonce.replace(/-/g, "").toLowerCase();
  const buf = Buffer.from(hex, "hex");
  if (buf.length === 32) {
    return buf;
  }
  if (buf.length === 16) {
    return Buffer.concat([Buffer.alloc(16), buf]);
  }
  return crypto.createHash("sha256").update(nonce).digest();
}

export function encryptRetryPayload(payload) {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptRetryPayload(buffer) {
  if (!buffer) return null;
  const payload = Buffer.from(buffer);
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const key = getAesKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
