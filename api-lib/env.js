const cached = {};

function normalizeAllowlist(value) {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function collectPeppers(env) {
  const map = new Map();
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("HMAC_PEPPER_")) continue;
    if (!value) continue;
    const suffix = key.replace("HMAC_PEPPER_", "").toLowerCase();
    map.set(suffix, value);
  }
  return map;
}

function parseIntWithDefault(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getEnv() {
  if (cached.env) {
    return cached.env;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL || "verify@blockchain-voting.store";
  const emailAllowlistRaw = process.env.EMAIL_DOMAIN_ALLOWLIST || "";
  const activePepperKeyId = (process.env.ACTIVE_HMAC_PEPPER_KEY_ID || "v1").toLowerCase();
  const verifierPrivateKey = process.env.VERIFIER_PK;
  const rpcUrl = process.env.RPC_URL;
  const aesRetryKey = process.env.AES_RETRY_KEY;
  const citizenSbtContractAddress = process.env.CITIZEN_SBT_CONTRACT_ADDRESS;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.");
  }
  if (!resendApiKey || !resendFromEmail) {
    throw new Error("Missing Resend configuration. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
  }
  if (!verifierPrivateKey) {
    throw new Error("VERIFIER_PK is required for signature generation.");
  }
  if (!rpcUrl) {
    throw new Error("RPC_URL is required for transaction receipt validation.");
  }
  if (!aesRetryKey) {
    throw new Error("AES_RETRY_KEY is required for retry payload encryption.");
  }
  if (!citizenSbtContractAddress) {
    throw new Error("CITIZEN_SBT_CONTRACT_ADDRESS is required for transaction validation.");
  }

  const pepperMap = collectPeppers(process.env);
  if (!pepperMap.has(activePepperKeyId)) {
    throw new Error(`No pepper found for ACTIVE_HMAC_PEPPER_KEY_ID=${activePepperKeyId}`);
  }

  const env = {
    supabaseUrl,
    supabaseServiceKey,
    resendApiKey,
    resendFromEmail,
    resendSenderName: process.env.RESEND_SENDER_NAME || "Agora Verification",
    emailDomainAllowlist: normalizeAllowlist(emailAllowlistRaw),
    activePepperKeyId,
    hmacPeppers: pepperMap,
    codeExpiryMinutes: parseIntWithDefault("EMAIL_CODE_EXPIRY_MINUTES", 5),
    signatureTtlMinutes: parseIntWithDefault("SIGNATURE_TTL_MINUTES", 30),
    maxVerificationAttempts: parseIntWithDefault("VERIFICATION_MAX_ATTEMPTS", 5),
    rateLimit: {
      windowSeconds: parseIntWithDefault("RATE_LIMIT_WINDOW_SECONDS", 300),
      maxRequests: parseIntWithDefault("RATE_LIMIT_MAX_REQUESTS", 5)
    },
    rpcUrl,
    verifierPrivateKey,
    aesRetryKey,
    citizenSbtContractAddress,
    chainId: Number.parseInt(process.env.CHAIN_ID || "1337", 10)
  };

  cached.env = env;
  return env;
}

export function getPepperValue(keyId) {
  const env = getEnv();
  const normalizedId = (keyId || env.activePepperKeyId).toLowerCase();
  const value = env.hmacPeppers.get(normalizedId);
  if (!value) {
    throw new Error(`Pepper material not found for key ${normalizedId}`);
  }
  return value;
}
