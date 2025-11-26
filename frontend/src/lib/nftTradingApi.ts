import type {
  Listing,
  ListingsResponse,
  NftToken,
  SwapProposal,
  ProposalsResponse,
  TokensResponse,
  ListingStatus,
  UserSummary,
  NftRarity,
} from "../types/nftTrading";

const API_BASE = `${process.env.REACT_APP_API_BASE_URL || ""}/api/nft-trading`;

export class NFTTradingApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = "NFTTradingApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

async function nftTradingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    // Public, read-only endpoints; no cookies needed
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let payload: ErrorResponse | undefined;
    try {
      payload = (await response.json()) as ErrorResponse;
    } catch (error) {
      // ignore body parse errors
    }
    const message = payload?.error?.message || payload?.message || `Request failed (${response.status})`;
    throw new NFTTradingApiError(message, response.status, payload?.error?.code, payload);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export interface ListingsQueryParams {
  cursor?: string | null;
  limit?: number;
  rarity?: NftRarity[];
  status?: ListingStatus | ListingStatus[];
  votingEvent?: string | null;
  search?: string | null;
  ownerAddress?: string | null;
  includeLocked?: boolean;
}

export function buildListingsQuery(params: ListingsQueryParams = {}): string {
  const searchParams = new URLSearchParams();

  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (typeof params.limit === "number") searchParams.set("limit", String(params.limit));
  if (params.rarity?.length) searchParams.set("rarity", params.rarity.join(","));
  if (params.status) {
    const statuses = Array.isArray(params.status) ? params.status : [params.status];
    searchParams.set("status", statuses.join(","));
  }
  if (params.votingEvent) searchParams.set("votingEvent", params.votingEvent);
  if (params.search) searchParams.set("search", params.search);
  if (params.ownerAddress) searchParams.set("owner", params.ownerAddress);
  if (typeof params.includeLocked === "boolean") searchParams.set("includeLocked", String(params.includeLocked));

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

interface RawListingsResponse {
  listings: RawListing[];
  nextCursor?: string | null;
}

interface RawListing extends Listing {}

interface RawProposalsResponse {
  proposals: RawProposal[];
  nextCursor?: string | null;
}

interface RawProposal extends SwapProposal {}

interface RawTokensResponse extends TokensResponse {}

export function normalizeListing(raw: RawListing): Listing {
  return {
    ...raw,
    expiresAt: raw.expiresAt ?? null,
    lastProposalAt: raw.lastProposalAt ?? null,
  };
}

export function normalizeProposal(raw: RawProposal): SwapProposal {
  return {
    ...raw,
    decisionAt: raw.decisionAt ?? null,
    message: raw.message ?? undefined,
  };
}

export function normalizeToken(raw: NftToken): NftToken {
  return {
    ...raw,
    lockedReason: raw.lockedReason ?? null,
  };
}

export async function getListings(params: ListingsQueryParams = {}): Promise<ListingsResponse> {
  const query = buildListingsQuery(params);
  const data = await nftTradingFetch<RawListingsResponse>(`/listings${query}`);
  return {
    listings: data.listings.map(normalizeListing),
    nextCursor: data.nextCursor ?? null,
  };
}

// Escrow deposits (Supabase-backed)
export interface Deposit {
  id: string;
  owner_wallet: string;
  nft_contract: string;
  token_id: string;
  status: string;
  tx_hash: string | null;
  required_ballot_id?: string | null;
  required_grade?: number | null;
  created_at: string;
}

export interface DepositsResponse {
  deposits: Deposit[];
  nextCursor: string | null;
}

export interface DepositsQueryParams {
  status?: "ACTIVE" | "WITHDRAWN" | "CLOSED";
  owner?: string;
  limit?: number;
  cursor?: string | null;
}

export function buildDepositsQuery(params: DepositsQueryParams = {}): string {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.owner) searchParams.set("owner", params.owner);
  if (typeof params.limit === "number") searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function getDeposits(params: DepositsQueryParams = {}): Promise<DepositsResponse> {
  const query = buildDepositsQuery(params);
  const data = await nftTradingFetch<DepositsResponse>(`/deposits${query}`);
  return {
    deposits: data.deposits ?? [],
    nextCursor: data.nextCursor ?? null,
  };
}

export async function getListingProposals(listingId: string, cursor?: string): Promise<ProposalsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const data = await nftTradingFetch<RawProposalsResponse>(`/listings/${listingId}/proposals${query}`);
  return {
    proposals: data.proposals.map(normalizeProposal),
    nextCursor: data.nextCursor ?? null,
  };
}

export interface CreateListingPayload {
  tokenId: string;
  contractAddress: string;
  message?: string;
  expiresAt?: string | null;
}

export interface ListingMutationResponse {
  listingId: string;
  txHash: string;
}

export async function createListing(body: CreateListingPayload, headers?: HeadersInit): Promise<ListingMutationResponse> {
  return nftTradingFetch<ListingMutationResponse>("/listings", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

export async function cancelListing(listingId: string, headers?: HeadersInit): Promise<{ success: boolean }> {
  return nftTradingFetch<{ success: boolean }>(`/listings/${listingId}`, {
    method: "DELETE",
    headers,
  });
}

export interface CreateProposalPayload {
  offeredToken: {
    tokenId: string;
    contractAddress: string;
  };
  message?: string;
  signature: string;
}

export interface ProposalMutationResponse {
  proposalId: string;
  txHash: string;
}

export async function createProposal(listingId: string, body: CreateProposalPayload, headers?: HeadersInit) {
  return nftTradingFetch<ProposalMutationResponse>(`/listings/${listingId}/proposals`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

export async function decideProposal(
  proposalId: string,
  decision: "APPROVE" | "REJECT",
  headers?: HeadersInit
): Promise<{ status: string; listingId: string; txHash?: string }> {
  return nftTradingFetch<{ status: string; listingId: string; txHash?: string }>(`/proposals/${proposalId}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision }),
    headers,
  });
}

export async function getTradableTokens(includeLocked = false): Promise<TokensResponse> {
  const query = includeLocked ? "?includeLocked=true" : "";
  const data = await nftTradingFetch<RawTokensResponse>(`/me/nfts${query}`);
  return {
    tokens: data.tokens.map(normalizeToken),
    blockedReason: data.blockedReason ?? null,
  };
}

export async function getUserSummary(): Promise<UserSummary> {
  return nftTradingFetch<UserSummary>("/me/summary");
}
