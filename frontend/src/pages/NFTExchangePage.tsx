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
