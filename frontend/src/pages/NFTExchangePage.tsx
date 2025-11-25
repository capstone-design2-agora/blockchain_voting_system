import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router";
import type { NavigateFunction } from "react-router";
import useEmailVerificationStore from "../stores/emailVerificationStore";
import useNFTTradingStore, { NFTTradingTab } from "../stores/nftTradingStore";
import type { UserSummary } from "../types/nftTrading";
import { checkHasSBT } from "../lib/sbt";
import { useToast } from "../components/ToastProvider";
import { depositToEscrow, swapOnEscrow, withdrawFromEscrow, getDeposit } from "../lib/escrow";
import "./NFTExchangePage.css";

interface TabConfig {
  key: NFTTradingTab;
  label: string;
  description: string;
  actionLabel?: string;
}

const TAB_CONFIG: TabConfig[] = [
  {
    key: "market",
    label: "마켓",
    description: "커뮤니티가 등록한 투표 NFT를 한눈에 탐색하세요.",
    actionLabel: "필터 설정 예정",
  },
  {
    key: "my-listings",
    label: "내 Listing",
    description: "등록한 NFT 현황, 잠금 상태, 진행 중인 거래를 확인합니다.",
    actionLabel: "NFT 등록 흐름 준비중",
  },
  {
    key: "proposals",
    label: "받은 제안",
    description: "내 NFT에 도착한 교환 제안을 승인/거절할 수 있어요.",
    actionLabel: "의사결정 모달 준비중",
  },
];

const PLACEHOLDER_CARDS = [
  {
    icon: <Sparkles size={20} />,
    title: "교환 요청 관리",
    subtitle: "제안 진척도를 실시간으로 확인 (준비중)",
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "안전한 거래",
    subtitle: "SBT 검증 기반 접근 제어 적용",
  },
  {
    icon: <ClipboardList size={20} />,
    title: "Listing 대시보드",
    subtitle: "등록/잠금/완료 상태 추적 UI 작업 중",
  },
];

export default function NFTExchangePage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    walletAddress: verificationWallet,
    setWallet: setVerificationWallet,
  } = useEmailVerificationStore();
  const {
    activeTab,
    setActiveTab,
    setWalletAddress,
    userSummary,
    setUserSummary,
    isUserSummaryLoading,
    setUserSummaryLoading,
  } = useNFTTradingStore();

  const [detectedWallet, setDetectedWallet] = useState<string | null>(verificationWallet);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [accessError, setAccessError] = useState<"wallet" | "sbt" | "unknown" | null>(null);

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
        totalListings: 0,
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
  }, [accessGranted, userSummary, isUserSummaryLoading, setUserSummary, setUserSummaryLoading]);

  const tabContent = useMemo(() => {
    const initial: Record<NFTTradingTab, React.ReactNode> = {
      market: null,
      "my-listings": null,
      proposals: null,
    };

    return TAB_CONFIG.reduce<Record<NFTTradingTab, React.ReactNode>>((acc, tab) => {
      acc[tab.key] = (
        <TabPlaceholder
          key={tab.key}
          title={tab.label}
          description={tab.description}
          actionLabel={tab.actionLabel}
          onAction={() => handleCTA(tab.key, navigate)}
        />
      );
      return acc;
    }, initial);
  }, [navigate]);

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
          <button type="button" className="breadcrumb-button" onClick={() => navigate("/email-verification")}
            aria-label="이메일 인증으로 돌아가기">
            <ArrowLeft size={16} />
            <span>이메일 인증</span>
          </button>
          <div className="nft-exchange-title">
            <div className="nft-exchange-icon">
              <ArrowLeftRight size={20} />
            </div>
            <div>
              <p className="nft-subtitle">Phase 1 · 거래소 프레임워크</p>
              <h1>커뮤니티 NFT 거래소</h1>
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
        <UserSummaryCard userSummary={userSummary} isLoading={isUserSummaryLoading} />
      </header>

      <main className="nft-exchange-content">
        <EscrowQuickPanel />

        <div className="nft-exchange-tabs">
          {TAB_CONFIG.map((tab) => (
            <TabButton
              key={tab.key}
              label={tab.label}
              isActive={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              badge={tab.key === "proposals" ? userSummary?.pendingProposals ?? 0 : undefined}
            />
          ))}
        </div>

        <section className="nft-placeholder-grid">
          {PLACEHOLDER_CARDS.map((card) => (
            <article key={card.title} className="nft-placeholder-card">
              <div className="nft-placeholder-icon">{card.icon}</div>
              <div>
                <p className="nft-placeholder-title">{card.title}</p>
                <p className="nft-placeholder-subtitle">{card.subtitle}</p>
              </div>
            </article>
          ))}
        </section>

        <div className="nft-tab-panel" role="tabpanel">
          {TAB_CONFIG.map((tab) => (
            <div key={tab.key} hidden={activeTab !== tab.key} className="nft-tab-panel-content">
              {activeTab === tab.key ? tabContent[tab.key] : null}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

function handleCTA(tab: NFTTradingTab, navigate: NavigateFunction) {
  if (tab === "my-listings") {
    navigate("/my-nfts");
    return;
  }

  if (tab === "market") {
    // Market CTA will later open composer; for now navigate home of trading section
    navigate("/nft-exchange");
    return;
  }

  navigate("/voting");
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

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: number;
}

function TabButton({ label, isActive, onClick, badge }: TabButtonProps) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <button
      className={`nft-tab-button ${isActive ? "nft-tab-button--active" : ""}`}
      onClick={onClick}
      type="button"
    >
      {label}
      {showBadge ? <span className="nft-tab-badge">{badge}</span> : null}
    </button>
  );
}

interface TabPlaceholderProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function TabPlaceholder({ title, description, actionLabel, onAction }: TabPlaceholderProps) {
  return (
    <div className="tab-placeholder">
      <div className="tab-placeholder-body">
        <ClipboardCheck size={18} />
        <div>
          <p className="tab-placeholder-title">{title} 준비중</p>
          <p className="tab-placeholder-description">{description}</p>
        </div>
      </div>
      {actionLabel ? (
        <button type="button" className="tab-placeholder-cta" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function UserSummaryCard({ userSummary, isLoading }: { userSummary: UserSummary | null; isLoading: boolean }) {
  return (
    <div className="nft-user-summary">
      <div className="nft-user-summary-row">
        <SummaryStat label="등록한 NFT" value={isLoading ? "-" : userSummary?.totalListings ?? 0} />
        <SummaryStat label="받은 제안" value={isLoading ? "-" : userSummary?.pendingProposals ?? 0} />
        <SummaryStat label="최근 동기화" value={isLoading ? "동기화 중" : formatTimestamp(userSummary?.lastSyncedAt)} />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-stat">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function EscrowQuickPanel() {
  const { showToast } = useToast();
  const [depositNft, setDepositNft] = useState("");
  const [depositTokenId, setDepositTokenId] = useState("");
  const [swapTargetId, setSwapTargetId] = useState("");
  const [swapNft, setSwapNft] = useState("");
  const [swapTokenId, setSwapTokenId] = useState("");
  const [withdrawId, setWithdrawId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [lookupId, setLookupId] = useState("");
  const [deposits, setDeposits] = useState<
    { id: string; owner: string; nft: string; tokenId: string; active: boolean }[]
  >([]);
  const [bulkIds, setBulkIds] = useState("");

  const refreshDeposits = async (ids: string[]) => {
    const signer = await (async () => {
      try {
        return await getSigner();
      } catch {
        return null;
      }
    })();
    const provider = signer ?? null;
    if (!provider) return;
  };

  const runTx = async (action: string, fn: () => Promise<any>) => {
    setIsRunning(true);
    try {
      const tx = await fn();
      showToast({ title: `${action} tx sent`, description: tx.hash });
      const receipt = await tx.wait();
      showToast({ title: `${action} confirmed`, description: `Block ${receipt.blockNumber}` });
    } catch (error: any) {
      console.error(`${action} failed`, error);
      showToast({
        title: `${action} failed`,
        description: error?.shortMessage || error?.message || "Unknown error",
        variant: "error",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="escrow-quick-panel">
      <div className="escrow-quick-panel__header">
        <div>
          <p className="escrow-quick-panel__eyebrow">Instant swap (no approval step)</p>
          <h2>Escrow Quick Actions</h2>
          <p className="escrow-quick-panel__note">Deposited NFTs can be taken instantly by anyone who swaps with their own NFT.</p>
        </div>
      </div>
      <div className="escrow-quick-panel__grid">
        <div className="escrow-card">
          <h3>Deposit NFT</h3>
          <label className="escrow-label">
            NFT contract
            <input value={depositNft} onChange={(e) => setDepositNft(e.target.value)} placeholder="0xabc..." />
          </label>
          <label className="escrow-label">
            Token ID
            <input value={depositTokenId} onChange={(e) => setDepositTokenId(e.target.value)} placeholder="e.g. 1" />
          </label>
          <button
            type="button"
            className="escrow-button"
            disabled={isRunning || !depositNft || !depositTokenId}
            onClick={() => runTx("Deposit", () => depositToEscrow(depositNft, depositTokenId))}
          >
            {isRunning ? "Working..." : "Deposit"}
          </button>
        </div>

        <div className="escrow-card">
          <h3>Swap</h3>
          <label className="escrow-label">
            Target deposit ID
            <input value={swapTargetId} onChange={(e) => setSwapTargetId(e.target.value)} placeholder="e.g. 1" />
          </label>
          <label className="escrow-label">
            My NFT contract
            <input value={swapNft} onChange={(e) => setSwapNft(e.target.value)} placeholder="0xabc..." />
          </label>
          <label className="escrow-label">
            My token ID
            <input value={swapTokenId} onChange={(e) => setSwapTokenId(e.target.value)} placeholder="e.g. 2" />
          </label>
          <button
            type="button"
            className="escrow-button"
            disabled={isRunning || !swapTargetId || !swapNft || !swapTokenId}
            onClick={() => runTx("Swap", () => swapOnEscrow(swapTargetId, swapNft, swapTokenId))}
          >
            {isRunning ? "Working..." : "Swap"}
          </button>
        </div>

        <div className="escrow-card">
          <h3>Withdraw</h3>
          <label className="escrow-label">
            Deposit ID
            <input value={withdrawId} onChange={(e) => setWithdrawId(e.target.value)} placeholder="e.g. 3" />
          </label>
          <button
            type="button"
            className="escrow-button"
            disabled={isRunning || !withdrawId}
            onClick={() => runTx("Withdraw", () => withdrawFromEscrow(withdrawId))}
          >
            {isRunning ? "Working..." : "Withdraw"}
          </button>
        </div>

        <div className="escrow-card escrow-card--wide">
          <h3>Lookup Deposit</h3>
          <label className="escrow-label">
            Deposit ID
            <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="e.g. 1" />
          </label>
          <button
            type="button"
            className="escrow-button"
            disabled={isRunning || !lookupId}
            onClick={() =>
              runTx("Lookup", async () => {
                const result = await getDeposit(lookupId);
                setDeposits((prev) => {
                  const next = prev.filter((d) => d.id !== lookupId);
                  next.push({
                    id: lookupId,
                    owner: result.owner,
                    nft: result.nft,
                    tokenId: result.tokenId.toString(),
                    active: result.active,
                  });
                  return next;
                });
                return { hash: "lookup" };
              })
            }
          >
            {isRunning ? "Working..." : "Fetch"}
          </button>
          {deposits.length > 0 ? (
            <div className="escrow-table">
              <div className="escrow-table__header">
                <span>ID</span>
                <span>NFT</span>
                <span>Token</span>
                <span>Status</span>
                <span>Owner</span>
                <span>Action</span>
              </div>
              {deposits.map((d) => (
                <div className="escrow-table__row" key={d.id}>
                  <span>{d.id}</span>
                  <span className="escrow-table__mono">{d.nft}</span>
                  <span>{d.tokenId}</span>
                  <span className={d.active ? "escrow-status--active" : "escrow-status--closed"}>
                    {d.active ? "ACTIVE" : "CLOSED"}
                  </span>
                  <span className="escrow-table__mono">{d.owner}</span>
                  <button
                    type="button"
                    className="escrow-button escrow-button--ghost"
                    disabled={!d.active || isRunning}
                    onClick={() => runTx("Withdraw", () => withdrawFromEscrow(d.id))}
                  >
                    Withdraw
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <KnownDepositsSection
        deposits={deposits}
        setDeposits={setDeposits}
        swapTargetId={swapTargetId}
        setSwapTargetId={setSwapTargetId}
        runTx={runTx}
        setBulkIds={setBulkIds}
        bulkIds={bulkIds}
      />
    </section>
  );
}

function truncate(addr: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

type DepositRow = { id: string; owner: string; nft: string; tokenId: string; active: boolean };

function KnownDepositsSection({
  deposits,
  setDeposits,
  swapTargetId,
  setSwapTargetId,
  runTx,
  bulkIds,
  setBulkIds,
}: {
  deposits: DepositRow[];
  setDeposits: React.Dispatch<React.SetStateAction<DepositRow[]>>;
  swapTargetId: string;
  setSwapTargetId: (id: string) => void;
  runTx: (action: string, fn: () => Promise<any>) => Promise<void>;
  bulkIds: string;
  setBulkIds: (s: string) => void;
}) {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const fetchDeposits = async (ids: string[]) => {
    setIsLoading(true);
    try {
      const results: DepositRow[] = [];
      for (const id of ids) {
        const trimmed = id.trim();
        if (!trimmed) continue;
        try {
          const res = await getDeposit(trimmed);
          results.push({
            id: trimmed,
            owner: res.owner,
            nft: res.nft,
            tokenId: res.tokenId.toString(),
            active: res.active,
          });
        } catch (error: any) {
          console.error("fetch deposit failed", error);
          showToast({
            title: `Fetch failed for ${trimmed}`,
            description: error?.shortMessage || error?.message || "Unknown error",
            variant: "error",
          });
        }
      }
      if (results.length) {
        setDeposits((prev) => {
          const map = new Map(prev.map((d) => [d.id, d]));
          results.forEach((r) => map.set(r.id, r));
          return Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetch = () => {
    const ids = bulkIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      showToast({ title: "No deposit IDs", description: "Enter at least one deposit ID", variant: "error" });
      return;
    }
    fetchDeposits(ids);
  };

  return (
    <div className="known-deposits">
      <div className="known-deposits__header">
        <div>
          <p className="escrow-quick-panel__eyebrow">Listings (on-chain fetch)</p>
          <h3>Known Deposits</h3>
          <p className="escrow-quick-panel__note">
            Enter deposit IDs to view status. Swap uses the quick panel above (sets target automatically).
          </p>
        </div>
        <div className="known-deposits__controls">
          <input
            className="escrow-input"
            placeholder="e.g. 1,2,3"
            value={bulkIds}
            onChange={(e) => setBulkIds(e.target.value)}
          />
          <button className="escrow-button" type="button" onClick={handleFetch} disabled={isLoading}>
            {isLoading ? "Fetching..." : "Fetch IDs"}
          </button>
        </div>
      </div>
      <div className="known-deposits__grid">
        {deposits.length === 0 ? (
          <div className="known-deposits__empty">No deposits loaded yet. Fetch by ID above.</div>
        ) : (
          deposits.map((d) => (
            <div className="known-deposits__card" key={d.id}>
              <div className="known-deposits__row">
                <span className="known-deposits__label">ID</span>
                <strong>#{d.id}</strong>
              </div>
              <div className="known-deposits__row">
                <span className="known-deposits__label">Owner</span>
                <span className="escrow-table__mono">{truncate(d.owner)}</span>
              </div>
              <div className="known-deposits__row">
                <span className="known-deposits__label">NFT</span>
                <span className="escrow-table__mono">{truncate(d.nft)}</span>
              </div>
              <div className="known-deposits__row">
                <span className="known-deposits__label">Token</span>
                <span>{d.tokenId}</span>
              </div>
              <div className="known-deposits__status">
                <span className={d.active ? "escrow-status--active" : "escrow-status--closed"}>
                  {d.active ? "ACTIVE" : "CLOSED"}
                </span>
              </div>
              <div className="known-deposits__actions">
                <button
                  type="button"
                  className="escrow-button escrow-button--ghost"
                  onClick={() => setSwapTargetId(d.id)}
                >
                  Set target for swap
                </button>
                <button
                  type="button"
                  className="escrow-button"
                  disabled={!d.active}
                  onClick={() => runTx("Withdraw", () => withdrawFromEscrow(d.id))}
                >
                  Withdraw
                </button>
              </div>
              {swapTargetId === d.id ? <p className="known-deposits__note">Swap target selected ↑</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp) {
    return "대기 중";
  }
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}
