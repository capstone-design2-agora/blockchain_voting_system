export type NftRarity = "common" | "rare" | "epic" | "legendary";

export interface NftAttribute {
  traitType: string;
  value: string | number;
}

export interface NftToken {
  tokenId: string;
  contractAddress: string;
  chainId?: number;
  title: string;
  description?: string;
  imageUrl: string;
  votingEvent?: string;
  rarity: NftRarity;
  mintedAt?: string;
  ownerAddress: string;
  ownerEns?: string;
  lockedReason?: "LISTED" | "PENDING_SWAP" | "PROPOSAL_LOCK" | null;
  isTradable?: boolean;
  attributes?: NftAttribute[];
}

export type ListingStatus = "DRAFT" | "ACTIVE" | "LOCKED" | "SWAPPED" | "CANCELLED" | "EXPIRED";

export interface Listing {
  listingId: string;
  status: ListingStatus;
  token: NftToken;
  listerAddress: string;
  createdAt: string;
  expiresAt?: string | null;
  activeProposalCount: number;
  lastProposalAt?: string | null;
  message?: string;
}

export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "EXPIRED" | "SETTLED";

export interface SwapProposal {
  proposalId: string;
  listingId: string;
  status: ProposalStatus;
  offeredToken: NftToken;
  requestedToken: NftToken;
  requesterAddress: string;
  requesterEns?: string;
  createdAt: string;
  decisionAt?: string | null;
  message?: string;
  txHash?: string;
}

export interface UserSummary {
  totalListings: number;
  pendingProposals: number;
  lockedListings: number;
  drafts: number;
  lastSyncedAt?: string | null;
}

export interface ListingsResponse {
  listings: Listing[];
  nextCursor?: string | null;
}

export interface ProposalsResponse {
  proposals: SwapProposal[];
  nextCursor?: string | null;
}

export interface TokensResponse {
  tokens: NftToken[];
  blockedReason?: string | null;
}
