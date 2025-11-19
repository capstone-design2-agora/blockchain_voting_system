import { create } from "zustand";
import type { Listing, SwapProposal, UserSummary, NftToken } from "../types/nftTrading";

export type NFTTradingTab = "market" | "my-listings" | "proposals";

export interface MarketFilters {
  search: string;
  rarity: string[];
  votingEvent: string | null;
  ownerAddress: string | null;
}

interface MarketCache {
  listings: Listing[];
  nextCursor: string | null;
  filters: MarketFilters;
  isLoading: boolean;
  error: string | null;
}

interface MyListingsCache {
  listings: Listing[];
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
}

interface ProposalsCache {
  proposals: SwapProposal[];
  nextCursor: string | null;
  statusFilter: string;
  isLoading: boolean;
  error: string | null;
}

interface TradableTokensState {
  tokens: NftToken[];
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: string | null;
}

interface NFTTradingState {
  activeTab: NFTTradingTab;
  walletAddress: string | null;
  isHydrated: boolean;
  userSummary: UserSummary | null;
  isUserSummaryLoading: boolean;
  market: MarketCache;
  myListings: MyListingsCache;
  proposals: ProposalsCache;
  tradableTokens: TradableTokensState;
  setActiveTab: (tab: NFTTradingTab) => void;
  setWalletAddress: (walletAddress: string | null) => void;
  setUserSummary: (summary: UserSummary | null) => void;
  setUserSummaryLoading: (loading: boolean) => void;
  setMarketFilters: (filters: Partial<MarketFilters>) => void;
  hydrateMarket: (payload: { listings: Listing[]; nextCursor: string | null }) => void;
  setMarketLoading: (loading: boolean) => void;
  setMarketError: (error: string | null) => void;
  setMyListingsState: (updater: Partial<MyListingsCache>) => void;
  setProposalsState: (updater: Partial<ProposalsCache>) => void;
  setTradableTokensState: (updater: Partial<TradableTokensState>) => void;
  reset: () => void;
}

const defaultMarket: MarketCache = {
  listings: [],
  nextCursor: null,
  filters: {
    search: "",
    rarity: [],
    votingEvent: null,
    ownerAddress: null,
  },
  isLoading: false,
  error: null,
};

const defaultMyListings: MyListingsCache = {
  listings: [],
  nextCursor: null,
  isLoading: false,
  error: null,
};

const defaultProposals: ProposalsCache = {
  proposals: [],
  nextCursor: null,
  statusFilter: "ALL",
  isLoading: false,
  error: null,
};

const defaultTradableTokens: TradableTokensState = {
  tokens: [],
  isLoading: false,
  error: null,
  lastFetchedAt: null,
};

const createInitialState = (): Omit<
  NFTTradingState,
  | "setActiveTab"
  | "setWalletAddress"
  | "setUserSummary"
  | "setUserSummaryLoading"
  | "setMarketFilters"
  | "hydrateMarket"
  | "setMarketLoading"
  | "setMarketError"
  | "setMyListingsState"
  | "setProposalsState"
  | "setTradableTokensState"
  | "reset"
> => ({
  activeTab: "market",
  walletAddress: null,
  isHydrated: false,
  userSummary: null,
  isUserSummaryLoading: false,
  market: { ...defaultMarket, filters: { ...defaultMarket.filters } },
  myListings: { ...defaultMyListings },
  proposals: { ...defaultProposals },
  tradableTokens: { ...defaultTradableTokens },
});

const useNFTTradingStore = create<NFTTradingState>((set, get) => ({
  ...createInitialState(),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setWalletAddress: (walletAddress) => {
    const prev = get().walletAddress;
    if (prev === walletAddress) {
      return;
    }
    set({
      ...createInitialState(),
      walletAddress,
      isHydrated: true,
    });
  },
  setUserSummaryLoading: (loading) => set({ isUserSummaryLoading: loading }),
  setUserSummary: (summary) => set({ userSummary: summary }),
  setMarketFilters: (filters) =>
    set((state) => ({
      market: {
        ...state.market,
        filters: {
          ...state.market.filters,
          ...filters,
        },
      },
    })),
  hydrateMarket: ({ listings, nextCursor }) =>
    set((state) => ({
      market: {
        ...state.market,
        listings,
        nextCursor,
        isLoading: false,
        error: null,
      },
    })),
  setMarketLoading: (loading) =>
    set((state) => ({
      market: {
        ...state.market,
        isLoading: loading,
      },
    })),
  setMarketError: (error) =>
    set((state) => ({
      market: {
        ...state.market,
        error,
      },
    })),
  setMyListingsState: (updater) =>
    set((state) => ({
      myListings: {
        ...state.myListings,
        ...updater,
      },
    })),
  setProposalsState: (updater) =>
    set((state) => ({
      proposals: {
        ...state.proposals,
        ...updater,
      },
    })),
  setTradableTokensState: (updater) =>
    set((state) => ({
      tradableTokens: {
        ...state.tradableTokens,
        ...updater,
      },
    })),
  reset: () => set(createInitialState()),
}));

export default useNFTTradingStore;
