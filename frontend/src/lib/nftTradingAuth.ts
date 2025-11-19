export interface WalletAuthHeaders {
  "x-wallet-address": string;
  "x-wallet-signature": string;
}

export interface WalletAuthRequest {
  address: string;
  action: string;
  payload?: Record<string, unknown>;
}

export function buildCanonicalMessage(action: string, payload: Record<string, unknown> = {}): string {
  const orderedEntries = Object.entries(payload).sort(([a], [b]) => a.localeCompare(b));
  const serialized = orderedEntries.map(([key, value]) => `${key}:${JSON.stringify(value)}`).join("\n");
  return `[NFT Trading]\naction:${action}\n${serialized}`.trim();
}

async function signMessage(address: string, message: string): Promise<string> {
  const provider = (globalThis as any)?.ethereum;
  if (!provider) {
    throw new Error("Wallet provider not found");
  }
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, address],
  });
  return String(signature);
}

export async function buildWalletAuthHeaders(request: WalletAuthRequest): Promise<WalletAuthHeaders> {
  if (!request.address) {
    throw new Error("Wallet address is required");
  }
  const message = buildCanonicalMessage(request.action, request.payload ?? {});
  const signature = await signMessage(request.address, message);
  return {
    "x-wallet-address": request.address,
    "x-wallet-signature": signature,
  };
}
