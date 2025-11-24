import type { EscrowDepositsResponse } from "../types/nftEscrow";

const API_BASE = "/api/nft-trading";

export class NFTEscrowApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "NFTEscrowApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
    ...init,
  });

  if (!res.ok) {
    let payload: any;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    const message = payload?.message || payload?.error || `Request failed (${res.status})`;
    throw new NFTEscrowApiError(message, res.status, payload?.error, payload);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

export async function fetchDeposits(params: { status?: string; owner?: string; wallet?: string } = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.owner) search.set("owner", params.owner);

  return request<EscrowDepositsResponse>(`/deposits${search.toString() ? `?${search.toString()}` : ""}`, {
    method: "GET",
    headers: params.wallet ? { "x-wallet-address": params.wallet } : undefined,
  });
}

export async function createDeposit(body: {
  depositId: number;
  nftContract: string;
  tokenId: string;
  txHash?: string;
  wallet: string;
}) {
  const { wallet, ...payload } = body;
  return request<{ depositId: number }>("/deposits", {
    method: "POST",
    headers: { "x-wallet-address": wallet },
    body: JSON.stringify(payload),
  });
}

export async function swapDeposits(body: { myDepositId: number; targetDepositId: number; txHash?: string; wallet: string }) {
  const { wallet, ...payload } = body;
  return request<{ swapped: boolean }>("/swap", {
    method: "POST",
    headers: { "x-wallet-address": wallet },
    body: JSON.stringify(payload),
  });
}

export async function withdrawDeposit(body: { depositId: number; txHash?: string; wallet: string }) {
  const { wallet, ...payload } = body;
  return request<{ withdrawn: boolean }>("/withdraw", {
    method: "POST",
    headers: { "x-wallet-address": wallet },
    body: JSON.stringify(payload),
  });
}
