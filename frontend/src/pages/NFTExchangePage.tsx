import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Loader2, Upload, RotateCcw, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import useEmailVerificationStore from "../stores/emailVerificationStore";
import useNFTTradingStore from "../stores/nftTradingStore";
import type { UserSummary } from "../types/nftTrading";
import { checkHasSBT } from "../lib/sbt";
import { useToast } from "../components/ToastProvider";
import { depositToEscrow, swapOnEscrow, withdrawFromEscrow } from "../lib/escrow";
import { getRewardNFTs, REWARD_NFT_ADDR } from "../lib/sbt";
import { getDeposits } from "../lib/nftTradingApi";
import { getConfig } from "../lib/config";
import RewardAbi from "../abi/VotingRewardNFT.json";
import EscrowAbi from "../abi/SimpleNFTEscrow.json";
import { ethers } from "ethers";
import "./NFTExchangePage.css";

let SIMPLE_ESCROW_ADDRESS: string;
try {
  SIMPLE_ESCROW_ADDRESS = getConfig().SIMPLE_ESCROW_ADDRESS;
} catch {
  SIMPLE_ESCROW_ADDRESS = "";
}
const ERC721_ABI = [
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
];

type NftCardData = {
  id: string;
  depositId?: string;
  ownerWallet?: string;
  name: string;
  image: string;
  rarity: string;
  tokenId: string;
  contract: string;
  badge?: string;
  description?: string;
};

export default function NFTExchangePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    walletAddress: verificationWallet,
    setWallet: setVerificationWallet,
  } = useEmailVerificationStore();
  const { setWalletAddress, userSummary, setUserSummary, isUserSummaryLoading, setUserSummaryLoading } =
    useNFTTradingStore();

  const [detectedWallet, setDetectedWallet] = useState<string | null>(verificationWallet);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<"wallet" | "sbt" | "unknown" | null>(null);
  const [availableNfts, setAvailableNfts] = useState<NftCardData[]>([]);
  const [listedNfts, setListedNfts] = useState<NftCardData[]>([]);
  const [listing, setListing] = useState(false);
  const [activeTab, setActiveTab] = useState<"mine" | "market">("mine");
  const [marketListings, setMarketListings] = useState<NftCardData[]>([]);
  const [swapTarget, setSwapTarget] = useState<NftCardData | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);
  const [withdrawLoadingId, setWithdrawLoadingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "tokenId">("newest");
  const [selectedMarketNFT, setSelectedMarketNFT] = useState<NftCardData | null>(null);
  const metadataCache = useRef<Map<string, string>>(new Map());

  const mergedMarketListings = useMemo(() => {
    const seen = new Set<string>();
    const merged: NftCardData[] = [];
    const placeholder = (id: string) => `https://picsum.photos/seed/deposit${id}/400/400`;
    [...marketListings, ...listedNfts].forEach((n) => {
      const key = String(n.id);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ ...n, image: n.image || placeholder(key) });
    });
    return merged;
  }, [marketListings, listedNfts]);
  const filteredMarketListings = useMemo(() => {
    let filtered = mergedMarketListings;

    // Filter out own NFTs
    if (detectedWallet) {
      const me = detectedWallet.toLowerCase();
      filtered = filtered.filter((n) => !n.ownerWallet || n.ownerWallet.toLowerCase() !== me);
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((n) =>
        n.name.toLowerCase().includes(term) ||
        n.tokenId.includes(term) ||
        n.rarity.toLowerCase().includes(term)
      );
    }

    // Sort
    const sorted = [...filtered];
    if (sortBy === "newest") {
      sorted.sort((a, b) => Number(b.id) - Number(a.id));
    } else if (sortBy === "oldest") {
      sorted.sort((a, b) => Number(a.id) - Number(b.id));
    } else if (sortBy === "tokenId") {
      sorted.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
    }

    return sorted;
  }, [mergedMarketListings, detectedWallet, searchTerm, sortBy]);

  // Hydrate wallet state if user already connected MetaMask outside of this session
  useEffect(() => {
    setDetectedWallet(verificationWallet);
    if (verificationWallet) {
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      return;
    }

    let mounted = true;
    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts: string[]) => {
        if (mounted && accounts.length > 0) {
          setVerificationWallet(accounts[0]);
          setDetectedWallet(accounts[0]);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      mounted = false;
    };
  }, [verificationWallet, setVerificationWallet]);

  const resolveProvider = () => {
    try {
      const cfg = getConfig();
      return new ethers.JsonRpcProvider(cfg.RPC_URL);
    } catch {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
  };

  const toHttp = (uri: string) => uri.replace(/^ipfs:\/\//, "https://gateway.pinata.cloud/ipfs/");

  const hydrateListingImages = async (deposits: NftCardData[]) => {
    const provider = resolveProvider();
    const updatedImages: Record<string, string> = {};
    const updatedNames: Record<string, string> = {};

    await Promise.all(
      deposits.map(async (d) => {
        if (d.image && !d.image.includes("picsum.photos")) return;
        const cacheKey = `${d.contract.toLowerCase()}-${d.tokenId}`;
        const cached = metadataCache.current.get(cacheKey);
        if (cached) {
          updatedImages[cacheKey] = cached;
          return;
        }
        try {
          const erc721 = new ethers.Contract(d.contract, ERC721_ABI, provider);
          const tokenUri = await erc721.tokenURI(d.tokenId);
          const url = toHttp(String(tokenUri));
          const resp = await fetch(url);
          if (!resp.ok) {
            return;
          }
          let imageUrl = "";
          let nftName = "";

          try {
            const jsonText = await resp.text();
            try {
              const meta = JSON.parse(jsonText);
              // It's a valid JSON
              if (meta?.image) {
                imageUrl = toHttp(String(meta.image));
              }
              if (meta?.name) {
                nftName = String(meta.name);
              }
            } catch {
              // Not a JSON, assume the URI itself is the image
              if (!jsonText.includes("<!DOCTYPE html>") && !jsonText.includes("<html")) {
                imageUrl = url;
              }
            }
          } catch {
            imageUrl = url;
          }
          if (imageUrl) {
            metadataCache.current.set(cacheKey, imageUrl);
            updatedImages[cacheKey] = imageUrl;
          }
          if (nftName) {
            updatedNames[cacheKey] = nftName;
          }
        } catch {
          /* ignore hydration failures */
        }
      })
    );

    if (Object.keys(updatedImages).length === 0 && Object.keys(updatedNames).length === 0) return;
    setMarketListings((prev) =>
      prev.map((item) => {
        const key = `${item.contract.toLowerCase()}-${item.tokenId}`;
        const updates: Partial<NftCardData> = {};
        if (updatedImages[key]) {
          updates.image = updatedImages[key];
        }
        if (updatedNames[key]) {
          updates.name = updatedNames[key];
        }
        return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
      })
    );
    setListedNfts((prev) =>
      prev.map((item) => {
        const key = `${item.contract.toLowerCase()}-${item.tokenId}`;
        const updates: Partial<NftCardData> = {};
        if (updatedImages[key]) {
          updates.image = updatedImages[key];
        }
        if (updatedNames[key]) {
          updates.name = updatedNames[key];
        }
        return Object.keys(updates).length > 0 ? { ...item, ...updates } : item;
      })
    );
  };

  // Guard route by checking wallet + SBT ownership
  useEffect(() => {
    let cancelled = false;

    const enforceAccess = async () => {
      if (!detectedWallet) {
        setAccessGranted(false);
        setIsCheckingAccess(false);
        if (accessError !== "wallet") {
          setAccessError("wallet");
          showToast({
            title: "지갑 연결이 필요합니다",
            description: "NFT 거래소는 인증된 지갑으로만 접근할 수 있어요.",
            variant: "error",
          });
        }
        navigate("/email-verification", { replace: true });
        return;
      }

      try {
        setIsCheckingAccess(true);
        const hasSBT = await checkHasSBT(detectedWallet);
        if (cancelled) {
          return;
        }

        if (!hasSBT) {
          setAccessGranted(false);
          setIsCheckingAccess(false);
          if (accessError !== "sbt") {
            setAccessError("sbt");
            showToast({
              title: "투표 자격이 확인되지 않았어요",
              description: "SBT 발급을 완료한 뒤 다시 시도해주세요.",
              variant: "error",
            });
          }
          navigate("/email-verification", { replace: true });
          return;
        }

        setWalletAddress(detectedWallet);
        setAccessGranted(true);
        setIsCheckingAccess(false);
        setAccessError(null);
      } catch (error) {
        console.error("NFT exchange access check failed", error);
        setAccessGranted(false);
        setIsCheckingAccess(false);
        if (accessError !== "unknown") {
          setAccessError("unknown");
          showToast({
            title: "접근 검증 중 문제가 발생했어요",
            description: "잠시 후 다시 시도하거나 새로고침해주세요.",
            variant: "error",
          });
        }
        navigate("/email-verification", { replace: true });
      }
    };

    enforceAccess();

    return () => {
      cancelled = true;
    };
  }, [detectedWallet, showToast, navigate, setWalletAddress, accessError]);

  // Provide placeholder summary while API wiring is pending
  useEffect(() => {
    if (!accessGranted || userSummary || isUserSummaryLoading) {
      return;
    }

    setUserSummaryLoading(true);
    const timer = window.setTimeout(() => {
      setUserSummary({
        totalListings: listedNfts.length,
        pendingProposals: 0,
        lockedListings: 0,
        drafts: 0,
        lastSyncedAt: new Date().toISOString(),
      });
      setUserSummaryLoading(false);
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [accessGranted, userSummary, isUserSummaryLoading, setUserSummary, setUserSummaryLoading, listedNfts.length]);

  useEffect(() => {
    if (!accessGranted) return;
    const placeholder = (id: string) => `https://picsum.photos/seed/deposit${id}/400/400`;
    const loadNfts = async () => {
      try {
        const wallet = detectedWallet;
        if (!wallet) return;
        const tokens = await getRewardNFTs(wallet);
        const mapped: NftCardData[] = tokens.map((t) => ({
          id: String(t.tokenId),
          ownerWallet: detectedWallet || undefined,
          name: t.metadata?.name || `Reward NFT #${t.tokenId}`,
          image: t.imageUrl || "",
          rarity: "Reward",
          tokenId: String(t.tokenId),
          contract: REWARD_NFT_ADDR || "",
        }));
        setAvailableNfts(mapped);
      } catch (error) {
        console.error("Failed to load wallet NFTs", error);
        showToast({
          title: "NFT 로드 실패",
          description: "지갑 NFT를 불러오지 못했어요. 네트워크/지갑 상태를 확인해주세요.",
          variant: "error",
        });
      }
    };
    loadNfts();

    // Pull market listings from API (deposits)
    getDeposits({ status: "ACTIVE", limit: 50 })
      .then((resp) => {
        const mapped: NftCardData[] = resp.deposits.map((d) => ({
          id: d.id,
          depositId: d.id,
          name: `Deposit #${d.id}`,
          image: placeholder(String(d.id)),
          rarity: "미정",
          tokenId: d.token_id,
          contract: d.nft_contract,
          ownerWallet: d.owner_wallet,
          badge: d.status,
        }));
        setMarketListings(mapped);
        hydrateListingImages(mapped);

        // Populate my listed NFTs from deposits I own
        const myAddr = detectedWallet?.toLowerCase();
        if (myAddr) {
          const mine = resp.deposits.filter((d) => d.owner_wallet?.toLowerCase() === myAddr);
          const mineCards: NftCardData[] = mine.map((d) => ({
            id: d.id,
            depositId: d.id,
            name: `Deposit #${d.id}`,
            image:
              availableNfts.find(
                (n) => n.contract.toLowerCase() === d.nft_contract.toLowerCase() && n.tokenId === d.token_id
              )?.image || placeholder(String(d.id)),
            rarity: "미정",
            tokenId: d.token_id,
            contract: d.nft_contract,
            ownerWallet: d.owner_wallet,
            badge: d.status,
          }));
          setListedNfts(mineCards);
          // Remove my listed tokens from available so they don't show twice
          setAvailableNfts((prev) =>
            prev.filter(
              (n) =>
                !mineCards.find(
                  (m) => m.contract.toLowerCase() === n.contract.toLowerCase() && m.tokenId === n.tokenId
                )
            )
          );
        }
      })
      .catch((error) => {
        console.error("Failed to load deposits", error);
      });
  }, [accessGranted, detectedWallet]);

  // Reset local listings when wallet changes so previous user's deposits don't stick around
  useEffect(() => {
    setListedNfts([]);
  }, [detectedWallet]);



  const handleListToMarket = async (nft: NftCardData) => {
    setListing(true);
    try {
      const escrowAddress =
        SIMPLE_ESCROW_ADDRESS ||
        (() => {
          try {
            return getConfig().SIMPLE_ESCROW_ADDRESS;
          } catch {
            return "";
          }
        })();
      if (!escrowAddress) {
        throw new Error("SIMPLE_ESCROW_ADDRESS not loaded");
      }

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const reward = new ethers.Contract(REWARD_NFT_ADDR, (RewardAbi as any).abi || RewardAbi, signer);

      const owner = await reward.ownerOf(nft.tokenId);

      if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
        throw new Error(`You don't own this NFT. Owner: ${owner}, You: ${signerAddress}`);
      }

      const isApproved = await reward.isApprovedForAll(signerAddress, escrowAddress);

      if (!isApproved) {
        const approveTx = await reward.setApprovalForAll(escrowAddress, true);
        showToast({ title: "승인 중...", description: approveTx.hash });
        await approveTx.wait();
      }

      const { depositId } = await depositToEscrow(nft.contract, nft.tokenId);

      if (!depositId) {
        throw new Error("Deposited but depositId not found in receipt");
      }
      setAvailableNfts((prev) => prev.filter((n) => n.id !== nft.id));
      const depositIdStr = depositId.toString();
      const ownerAddress = signerAddress || detectedWallet || undefined;
      setListedNfts((prev) => [
        ...prev,
        { ...nft, id: depositIdStr, depositId: depositIdStr, ownerWallet: ownerAddress, badge: "LISTED" },
      ]);
      showToast({ title: "마켓에 올렸습니다", description: `${nft.name}이(가) 교환 대기열에 추가됨` });
    } catch (error: any) {
      console.error("listing failed", error);
      showToast({
        title: "예치 실패",
        description: error?.shortMessage || error?.message || "Unknown error",
        variant: "error",
      });
    } finally {
      setListing(false);
    }
  };

  const handleWithdraw = (nft: NftCardData) => {
    setListedNfts((prev) => prev.filter((n) => n.id !== nft.id));
    setAvailableNfts((prev) => [
      ...prev,
      { ...nft, id: nft.tokenId, depositId: undefined, badge: undefined },
    ]);
    showToast({ title: "마켓에서 내렸습니다", description: `${nft.name}이(가) 다시 내 보관함으로 이동` });
  };

  const refreshMarket = async () => {
    try {
      const placeholder = (id: string) => `https://picsum.photos/seed/deposit${id}/400/400`;
      const resp = await getDeposits({ status: "ACTIVE", limit: 50 });
      const mapped: NftCardData[] = resp.deposits.map((d) => ({
        id: d.id,
        depositId: d.id,
        name: `Deposit #${d.id}`,
        image: placeholder(String(d.id)),
        rarity: "미정",
        tokenId: d.token_id,
        contract: d.nft_contract,
        ownerWallet: d.owner_wallet,
        badge: d.status,
      }));
      setMarketListings(mapped);
      hydrateListingImages(mapped);

      // Refresh my listings based on owner address
      const myAddr = detectedWallet?.toLowerCase();
      if (myAddr) {
        const mine = resp.deposits.filter((d) => d.owner_wallet?.toLowerCase() === myAddr);
        const mineCards: NftCardData[] = mine.map((d) => ({
          id: d.id,
          depositId: d.id,
          name: `Deposit #${d.id}`,
          image:
            availableNfts.find(
              (n) => n.contract.toLowerCase() === d.nft_contract.toLowerCase() && n.tokenId === d.token_id
            )?.image || placeholder(String(d.id)),
          rarity: "미정",
          tokenId: d.token_id,
          contract: d.nft_contract,
          ownerWallet: d.owner_wallet,
          badge: d.status,
        }));
        setListedNfts(mineCards);
        setAvailableNfts((prev) =>
          prev.filter(
            (n) =>
              !mineCards.find(
                (m) => m.contract.toLowerCase() === n.contract.toLowerCase() && m.tokenId === n.tokenId
              )
          )
        );
      }
    } catch (error) {
      console.error("refresh market failed", error);
    }
  };

  const handleWithdrawOnChain = async (nft: NftCardData) => {
    setWithdrawLoadingId(nft.id);
    try {
      const targetDepositId = nft.depositId || nft.id;
      await withdrawFromEscrow(targetDepositId);
      handleWithdraw(nft);
      await refreshMarket();
    } catch (error: any) {
      console.error("withdraw failed", error);
      showToast({
        title: "withdraw 실패",
        description: error?.shortMessage || error?.message || "Unknown error",
        variant: "error",
      });
    } finally {
      setWithdrawLoadingId(null);
    }
  };

  const handleSwap = async (myNft: NftCardData) => {
    if (!swapTarget) return;
    setSwapLoading(true);
    try {
      // Pre-check that the target deposit is still active to avoid revert
      const cfg = getConfig();
      const escrowAddress = cfg.SIMPLE_ESCROW_ADDRESS;
      if (!escrowAddress) {
        throw new Error("SIMPLE_ESCROW_ADDRESS가 비어 있습니다. config.json을 확인하세요.");
      }
      const provider = resolveProvider();
      const escrow = new ethers.Contract(escrowAddress, (EscrowAbi as any).abi || EscrowAbi, provider);
      const targetDeposit = await escrow.deposits(swapTarget.id);
      const isActive = Boolean((targetDeposit as any)?.active ?? (targetDeposit as any)?.[3]);
      if (!isActive) {
        throw new Error("이 매물은 이미 스왑되었거나 철회되었습니다. 새로고침 후 다른 매물을 선택하세요.");
      }

      // Ensure escrow is approved to transfer my NFT
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await browserProvider.getSigner();
      const erc721 = new ethers.Contract(myNft.contract, ERC721_ABI, signer);
      const isApproved = await erc721.isApprovedForAll(await signer.getAddress(), escrowAddress);
      if (!isApproved) {
        const approveTx = await erc721.setApprovalForAll(escrowAddress, true);
        showToast({ title: "승인 중...", description: approveTx.hash });
        await approveTx.wait();
      }

      await swapOnEscrow(swapTarget.id, myNft.contract, myNft.tokenId);
      showToast({ title: "스왑 성공", description: `${swapTarget.name} ↔ ${myNft.name}` });
      setAvailableNfts((prev) => prev.filter((n) => n.id !== myNft.id));
      setListedNfts((prev) => prev.filter((n) => n.id !== swapTarget.id));
      setMarketListings((prev) => prev.filter((n) => n.id !== swapTarget.id));
      setSwapTarget(null);
      await refreshMarket();
    } catch (error: any) {
      console.error("swap failed", error);
      const data = (error?.data as string) || (error?.info?.error?.data as string) || "";
      const isInactive = typeof data === "string" && data.startsWith("0xc33e1367");
      const description =
        error?.shortMessage ||
        (isInactive
          ? "이미 스왑/철회된 매물입니다. 새로고침 후 다른 매물을 선택하세요."
          : error?.message) ||
        "Unknown error";
      showToast({
        title: "스왑 실패",
        description,
        variant: "error",
      });
    } finally {
      setSwapLoading(false);
    }
  };

  if (isCheckingAccess) {
    return <AccessLoadingState />;
  }

  if (!accessGranted) {
    return null;
  }

  return (
    <div className="nft-exchange-page">
      <header className="nft-exchange-header">
        <div className="nft-exchange-header-content">
          <div className="nft-exchange-title">
            <div className="nft-exchange-icon">
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <p className="nft-subtitle">NFT 거래소</p>
              <h1>NFT 거래소</h1>

            </div>
          </div>
          <div className="nft-exchange-actions">
            <button
              className="nft-exchange-button nft-exchange-button--ghost"
              onClick={() => navigate("/my-nfts")}
            >
              내 컬렉션 보기
            </button>
            <button className="nft-exchange-button" onClick={() => navigate("/voting")}>
              투표하러 가기
            </button>
          </div>
        </div>
      </header>

      <main className="nft-exchange-content">
        <div className="tab-toggle-group">
          <button
            className={`tab-toggle ${activeTab === "mine" ? "tab-toggle--active" : ""}`}
            onClick={() => setActiveTab("mine")}
          >
            내 NFT 올리기
          </button>
          <button
            className={`tab-toggle ${activeTab === "market" ? "tab-toggle--active" : ""}`}
            onClick={() => setActiveTab("market")}
          >
            마켓 전체 보기
          </button>
        </div>

        {activeTab === "mine" ? (
          <section className="exchange-columns">
            <div className="exchange-column">
              <div className="exchange-column__header">
                <div>
                  <p className="nft-subtitle">내 NFT</p>
                  <h2>보유한 NFT 목록</h2>

                </div>
              </div>
              <NftGrid
                nfts={availableNfts}
                emptyText="지갑에 표시할 NFT가 없습니다."
                actionLabel={listing ? "처리 중..." : "마켓에 올리기"}
                actionIcon={<Upload size={16} />}
                onAction={handleListToMarket}
                disabled={listing}
              />
            </div>

            <div className="exchange-column">
              <div className="exchange-column__header">
                <div>
                  <p className="nft-subtitle">마켓 대기열</p>
                  <h2>마켓에 올라간 NFT</h2>

                </div>
              </div>
              <NftGrid
                nfts={listedNfts}
                emptyText="마켓에 올린 NFT가 없습니다."
                actionLabel={withdrawLoadingId ? "처리 중..." : "내리기"}
                actionIcon={<RotateCcw size={16} />}
                onAction={handleWithdrawOnChain}
                badge="LISTED"
                disabled={!!withdrawLoadingId}
              />
            </div>
          </section>
        ) : (
          <section className="exchange-column">
            <div className="exchange-column__header">
              <div>
                <p className="nft-subtitle">마켓</p>
                <h2>전체 마켓 NFT</h2>
              </div>
            </div>

            {/* Search and Sort Controls */}
            <div className="market-controls">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="NFT 이름, 토큰 ID, 레어도로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="sort-box">
                <label htmlFor="sort-select">정렬:</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "tokenId")}
                  className="sort-select"
                >
                  <option value="newest">최신순</option>
                  <option value="oldest">오래된순</option>
                  <option value="tokenId">토큰 ID순</option>
                </select>
              </div>
            </div>

            <NftGrid
              nfts={filteredMarketListings}
              emptyText="마켓에 올라온 NFT가 없습니다."
              actionLabel="스왑하기"
              actionIcon={<ArrowLeftRight size={16} />}
              onAction={(nft) => {
                setSwapTarget(nft);
              }}
              onCardClick={(nft) => setSelectedMarketNFT(nft)}
              renderAction={(nft) => {
                const isMine =
                  nft.ownerWallet && detectedWallet
                    ? nft.ownerWallet.toLowerCase() === detectedWallet.toLowerCase()
                    : false;
                if (isMine) {
                  return (
                    <button
                      className="nft-exchange-button nft-exchange-button--full"
                      onClick={() => handleWithdrawOnChain(nft)}
                      disabled={!!withdrawLoadingId}
                    >
                      <RotateCcw size={16} />
                      <span>내리기</span>
                    </button>
                  );
                }
                return (
                  <button
                    className="nft-exchange-button nft-exchange-button--full"
                    onClick={() => setSwapTarget(nft)}
                    disabled={swapLoading}
                  >
                    <ArrowLeftRight size={16} />
                    <span>스왑하기</span>
                  </button>
                );
              }}
              badge="LISTED"
              disabled={swapLoading}
            />
            {swapTarget ? (
              <SwapPicker
                target={swapTarget}
                myNfts={availableNfts}
                onClose={() => setSwapTarget(null)}
                onSwap={handleSwap}
                loading={swapLoading}
              />
            ) : null}
          </section>
        )}
      </main>

      {/* NFT Detail Modal */}
      {selectedMarketNFT && (
        <div className="nft-modal-overlay" onClick={() => setSelectedMarketNFT(null)}>
          <div className="nft-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="nft-modal-close" onClick={() => setSelectedMarketNFT(null)}>
              ✕
            </button>

            <div className="nft-modal-grid">
              {/* 왼쪽: 이미지 */}
              <div className="nft-modal-image-section">
                <img
                  src={selectedMarketNFT.image}
                  alt={selectedMarketNFT.name}
                  className="nft-modal-image"
                />
              </div>

              {/* 오른쪽: 상세 정보 */}
              <div className="nft-modal-details">
                <div className="nft-modal-header">
                  <h2 className="nft-modal-title">{selectedMarketNFT.name}</h2>
                  <span className="nft-modal-rarity" style={{
                    color: selectedMarketNFT.rarity === "레전더리" ? "#fbbf24" :
                      selectedMarketNFT.rarity === "에픽" ? "#a78bfa" :
                        selectedMarketNFT.rarity === "레어" ? "#60a5fa" : "#94a3b8"
                  }}>
                    {selectedMarketNFT.rarity}
                  </span>
                </div>

                <div className="nft-modal-info-grid">
                  <div className="nft-modal-info-item">
                    <span className="nft-modal-label">🎫 토큰 ID</span>
                    <span className="nft-modal-value">{selectedMarketNFT.tokenId}</span>
                  </div>

                  <div className="nft-modal-info-item">
                    <span className="nft-modal-label">📜 컨트랙트</span>
                    <span className="nft-modal-value mono">
                      {selectedMarketNFT.contract.substring(0, 6)}...{selectedMarketNFT.contract.substring(selectedMarketNFT.contract.length - 4)}
                    </span>
                  </div>

                  {selectedMarketNFT.ownerWallet && (
                    <div className="nft-modal-info-item">
                      <span className="nft-modal-label">👤 소유자</span>
                      <span className="nft-modal-value mono">
                        {selectedMarketNFT.ownerWallet.substring(0, 6)}...{selectedMarketNFT.ownerWallet.substring(selectedMarketNFT.ownerWallet.length - 4)}
                      </span>
                    </div>
                  )}

                  <div className="nft-modal-info-item">
                    <span className="nft-modal-label">🏷️ 상태</span>
                    <span className="nft-modal-value">{selectedMarketNFT.badge || "마켓 등록"}</span>
                  </div>
                </div>

                <div className="nft-modal-description">
                  <h3 className="nft-modal-section-title">📝 설명</h3>
                  <p className="nft-modal-description-text">
                    이 NFT는 현재 마켓에 등록되어 있습니다.
                    스왑 기능을 통해 내 NFT와 교환할 수 있습니다.
                  </p>
                </div>

                <div className="nft-modal-actions">
                  <button
                    className="nft-modal-btn nft-modal-btn-primary"
                    onClick={() => {
                      setSwapTarget(selectedMarketNFT);
                      setSelectedMarketNFT(null);
                    }}
                  >
                    스왑하기 🔄
                  </button>
                  <button
                    className="nft-modal-btn nft-modal-btn-secondary"
                    onClick={() => setSelectedMarketNFT(null)}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AccessLoadingState() {
  return (
    <div className="nft-access-loader">
      <div className="nft-access-spinner">
        <Loader2 size={32} className="spinner" />
        <p>거래소 접근 권한을 확인하는 중...</p>
      </div>
    </div>
  );
}

function NftGrid({
  nfts,
  emptyText,
  actionLabel,
  actionIcon,
  onAction,
  renderAction,
  badge,
  disabled,
  onCardClick,
}: {
  nfts: NftCardData[];
  emptyText: string;
  actionLabel: string;
  actionIcon: React.ReactNode;
  onAction: (nft: NftCardData) => void;
  renderAction?: (nft: NftCardData) => React.ReactNode;
  badge?: string;
  disabled?: boolean;
  onCardClick?: (nft: NftCardData) => void;
}) {
  if (nfts.length === 0) {
    return <div className="nft-grid-empty">{emptyText}</div>;
  }
  return (
    <div className="nft-card-grid">
      {nfts.map((nft) => (
        <article key={`${nft.id}-${nft.contract}`} className="nft-card">
          <div
            className="nft-card__image"
            onClick={() => onCardClick?.(nft)}
            style={{ cursor: onCardClick ? 'pointer' : 'default' }}
          >
            <img src={nft.image || undefined} alt={nft.name} />
            <span
              className={`rarity-badge ${nft.rarity === "레전더리" || nft.rarity === "Legendary"
                ? "rarity-badge--legendary"
                : nft.rarity === "에픽" || nft.rarity === "Epic"
                  ? "rarity-badge--epic"
                  : nft.rarity === "레어" || nft.rarity === "Rare"
                    ? "rarity-badge--rare"
                    : "rarity-badge--common"
                }`}
            >
              {nft.rarity}
            </span>
            {badge ? <span className="nft-chip nft-chip--secondary">{badge}</span> : null}
          </div>
          <div className="nft-card__body">
            <p className="nft-card__title">{nft.name}</p>
            <p className="nft-card__meta">
              Token #{nft.tokenId} · <span className="mono">{nft.contract}</span>
            </p>
            {renderAction ? (
              renderAction(nft)
            ) : (
              <button
                className="nft-exchange-button nft-exchange-button--full"
                onClick={() => onAction(nft)}
                disabled={disabled}
              >
                {actionIcon}
                <span>{actionLabel}</span>
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function SwapPicker({
  target,
  myNfts,
  onClose,
  onSwap,
  loading,
}: {
  target: NftCardData;
  myNfts: NftCardData[];
  onClose: () => void;
  onSwap: (myNft: NftCardData) => void;
  loading: boolean;
}) {
  return (
    <div className="swap-picker-overlay" onClick={onClose}>
      <div className="swap-picker" onClick={(e) => e.stopPropagation()}>
        <div className="swap-picker__header">
          <div>
            <p className="nft-subtitle">스왑 대상</p>
            <h3>{target.name}</h3>
            <p className="nft-hint">내 NFT를 선택해 즉시 스왑합니다.</p>
          </div>
          <button className="swap-picker__close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <div className="swap-picker__list">
          {myNfts.length === 0 ? (
            <div className="nft-grid-empty">스왑할 내 NFT가 없습니다.</div>
          ) : (
            myNfts.map((nft) => (
              <div key={nft.id} className="swap-picker__item">
                <div className="swap-picker__info">
                  <img src={nft.image} alt={nft.name} />
                  <div>
                    <p className="swap-picker__title">{nft.name}</p>
                    <p className="nft-card__meta">
                      Token #{nft.tokenId} · <span className="mono">{nft.contract}</span>
                    </p>
                  </div>
                </div>
                <button className="nft-exchange-button" disabled={loading} onClick={() => onSwap(nft)}>
                  <ArrowRight size={16} />
                  <span>이 NFT로 스왑</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
