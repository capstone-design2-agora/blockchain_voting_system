import { buildListingsQuery, normalizeListing, normalizeProposal, normalizeToken } from "./nftTradingApi";
import type { Listing, SwapProposal, NftToken } from "../types/nftTrading";

describe("buildListingsQuery", () => {
  it("serializes filters and pagination into query string", () => {
    const query = buildListingsQuery({
      cursor: "abc",
      limit: 20,
      rarity: ["epic", "legendary"],
      status: ["ACTIVE", "LOCKED"],
      search: "학생",
      ownerAddress: "0x123",
      includeLocked: true,
    });

    expect(query).toBe(
      `?cursor=abc&limit=20&rarity=epic%2Clegendary&status=ACTIVE%2CLOCKED&search=%ED%95%99%EC%83%9D&owner=0x123&includeLocked=true`
    );
  });

  it("returns empty string when no params provided", () => {
    expect(buildListingsQuery()).toBe("");
  });
});

describe("normalizers", () => {
  it("fills nullable listing fields", () => {
    const listing: Listing = {
      listingId: "lst_1",
      status: "ACTIVE",
      token: {
        tokenId: "1",
        contractAddress: "0xNFT",
        title: "학생회장",
        imageUrl: "https://example.com/1.png",
        rarity: "rare",
        ownerAddress: "0xabc",
      },
      listerAddress: "0xabc",
      createdAt: "2024-01-01T00:00:00Z",
      activeProposalCount: 0,
    };

    const normalized = normalizeListing(listing);
    expect(normalized.expiresAt).toBeNull();
    expect(normalized.lastProposalAt).toBeNull();
  });

  it("normalizes proposal optional fields", () => {
    const proposal: SwapProposal = {
      proposalId: "prp_1",
      listingId: "lst_1",
      status: "PENDING",
      offeredToken: {
        tokenId: "2",
        contractAddress: "0xNFT",
        title: "급식",
        imageUrl: "https://example.com/2.png",
        rarity: "common",
        ownerAddress: "0xdef",
      },
      requestedToken: {
        tokenId: "1",
        contractAddress: "0xNFT",
        title: "학생회장",
        imageUrl: "https://example.com/1.png",
        rarity: "rare",
        ownerAddress: "0xabc",
      },
      requesterAddress: "0xdef",
      createdAt: "2024-01-02T00:00:00Z",
    };

    const normalized = normalizeProposal(proposal);
    expect(normalized.decisionAt).toBeNull();
    expect(normalized.message).toBeUndefined();
  });

  it("ensures lockedReason defaults to null on tokens", () => {
    const token: NftToken = {
      tokenId: "3",
      contractAddress: "0xNFT",
      title: "투표권",
      imageUrl: "https://example.com/3.png",
      rarity: "epic",
      ownerAddress: "0xghi",
    };

    const normalized = normalizeToken(token);
    expect(normalized.lockedReason).toBeNull();
  });
});
