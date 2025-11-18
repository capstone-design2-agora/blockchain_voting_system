import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatEther, formatUnits } from "ethers";
import type { TransactionReceipt } from "web3-types";
import {
  calculateTurnout,
  castVote,
  fetchBallotMetadata,
  fetchProposals,
  hasVoted,
  type Proposal,
} from "../lib/voting";
import {
  disconnectWallet,
  ensureWalletConnection,
  getExpectedChainLabel,
  getWeb3,
  hasBrowserWallet,
  isExpectedChain,
  onAccountsChanged,
  onChainChanged,
} from "../lib/web3";
import { checkHasSBT } from "../lib/sbt";
import useEmailVerificationStore from "../stores/emailVerificationStore";

type CandidateRecord = {
  id: number;
  name: string;
  votes: number;
  description: string;
  accent: string;
  icon: string;
  pledges?: string[];
};

const FALLBACK_CANDIDATES: CandidateRecord[] = [
  {
    id: 0,
    name: "Alice",
    votes: 328,
    description: "투명한 예산 집행과 실시간 공개를 약속합니다.",
    accent: "linear-gradient(135deg, #1f3c88, #4c6ef5)",
    icon: "✨",
    pledges: [
      "예산 집행 내역을 블록체인으로 즉시 공개",
      "공공 프로젝트 지출 한도를 커뮤니티 투표로 결정",
      "분기별 감사 보고서를 시민에게 공유",
    ],
  },
  {
    id: 1,
    name: "Bob",
    votes: 287,
    description: "거버넌스 참여자를 위해 UX를 혁신합니다.",
    accent: "linear-gradient(135deg, #322e81, #7c3aed)",
    icon: "🚀",
    pledges: [
      "모바일 전용 거버넌스 인터페이스 도입",
      "투표 접근성 향상을 위한 다국어 지원",
      "실시간 참여 인사이트 대시보드 공개",
    ],
  },
  {
    id: 2,
    name: "Charlie",
    votes: 198,
    description: "안정성과 보안을 최우선으로 설계합니다.",
    accent: "linear-gradient(135deg, #1e293b, #475569)",
    icon: "🛡️",
    pledges: [
      "합의 노드 보안 점검 주기를 월 1회로 강화",
      "이중 인증 기반의 투표 계정 보호",
      "사고 대응 프로토콜을 투명하게 문서화",
    ],
  },
];

type BallotMeta = {
  id: string;
  title: string;
  description: string;
  opensAt: string;
  closesAt: string;
  announcesAt: string;
  expectedVoters: number | null;
  turnout?: number;
};

type NormalizedReceipt = {
  statusLabel: string;
  displayHash: string;
  transactionHash: string;
  blockNumber: number | null;
  gasUsed: string;
  effectiveGasPrice: string;
  confirmations: number;
};

type StoredVotePayload = {
  version: number;
  candidateId: number;
  candidateName: string;
  receipt: NormalizedReceipt;
};

type BlockDetails = {
  blockNumber: number | null;
  hash: string;
  parentHash: string;
  timestampLabel: string;
  transactionCount: number | null;
};

const LAST_VOTE_STORAGE_KEY = "agora:lastVote:v1";
const LAST_VOTE_STORAGE_VERSION = 1;
const OPTIMISTIC_REFRESH_DELAY_MS = 2500;
const EXPLORER_TEMPLATE = process.env.REACT_APP_EXPLORER_TX_TEMPLATE ?? "";
const RPC_VERIFICATION_ENDPOINT =
  process.env.REACT_APP_PUBLIC_RPC_URL ?? "https://<rpc-endpoint>";

const FALLBACK_BALLOTS: BallotMeta[] = [
  {
    id: "citizen-2025",
    title: "제 25대 대통령 선거",
    description:
      "대한민국 제 25대 대통령을 선출하는 공식 선거입니다.",
    opensAt: "2025-02-28T09:00:00+09:00",
    closesAt: "2025-03-15T09:00:00+09:00",
    announcesAt: "2025-03-15T12:00:00+09:00",
    expectedVoters: 1000,
    turnout: 68.7,
  },
  {
    id: "charter-amend-2025",
    title: "서강대학교 총 학생회장 선거",
    description:
      "서강대학교 총 학생회장을 선출하는 선거입니다.",
    opensAt: "2025-03-20T12:00:00+09:00",
    closesAt: "2025-03-22T18:00:00+09:00",
    announcesAt: "2025-03-23T10:00:00+09:00",
    expectedVoters: 500,
    turnout: 12.3,
  },
  {
    id: "governance-review-2024",
    title: "제 17대 국회의원 선거",
    description:
      "대한민국 제 17대 국회의원을 선출하는 공식 선거입니다.",
    opensAt: "2025-02-03T09:00:00+09:00",
    closesAt: "2025-03-05T20:00:00+09:00",
    announcesAt: "2025-03-05T21:30:00+09:00",
    expectedVoters: 2500,
    turnout: 82.4,
  },
];

export function VotingApp() {
  const navigate = useNavigate();
  const resetVerificationFlow = useEmailVerificationStore((state) => state.reset);
  const storedVoteSnapshot = useMemo(() => readLastVoteSnapshot(), []);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [ballots, setBallots] = useState<BallotMeta[]>(FALLBACK_BALLOTS);
  const [activeBallot, setActiveBallot] = useState<BallotMeta>(FALLBACK_BALLOTS[0]);
  const [timeToClose, setTimeToClose] = useState<string>("");
  const [timeToAnnounce, setTimeToAnnounce] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<string>("익명 유권자");
  const [turnoutPercent, setTurnoutPercent] = useState<number>(
    FALLBACK_BALLOTS[0].turnout ?? 0
  );
  const [totalVotes, setTotalVotes] = useState<number>(0);
  const [userHasVoted, setUserHasVoted] = useState<boolean>(
    () => Boolean(storedVoteSnapshot)
  );
  const [pledgeModal, setPledgeModal] = useState<CandidateRecord | null>(null);
  const [lastReceipt, setLastReceipt] = useState<NormalizedReceipt | null>(
    storedVoteSnapshot?.receipt ?? null
  );
  const [lastCandidateId, setLastCandidateId] = useState<number | null>(
    storedVoteSnapshot?.candidateId ?? null
  );
  const [lastCandidateName, setLastCandidateName] = useState<string | null>(
    storedVoteSnapshot?.candidateName ?? null
  );
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [blockDetails, setBlockDetails] = useState<BlockDetails | null>(null);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string>("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const expectedChainLabel = useMemo(() => getExpectedChainLabel(), []);
  const activeStatus = deriveBallotStatus(activeBallot);
  const resultsVisible = activeStatus === "마감";  // 결과 발표 시간이 지남
  const countingInProgress = activeStatus === "개표 중";  // 투표 마감 후 결과 발표 전
  const revealResults = resultsVisible || demoMode;

  const metaMap = useMemo(
    () =>
      new Map(
        FALLBACK_CANDIDATES.map((candidate) => [
          candidate.name,
          {
            description: candidate.description,
            accent: candidate.accent,
            icon: candidate.icon,
            pledges: candidate.pledges,
          },
        ])
      ),
    []
  );
  const explorerTxUrl = useMemo(() => {
    if (!lastReceipt?.transactionHash || !EXPLORER_TEMPLATE) {
      return "";
    }
    return EXPLORER_TEMPLATE.includes("%s")
      ? EXPLORER_TEMPLATE.replace("%s", lastReceipt.transactionHash)
      : `${EXPLORER_TEMPLATE}${lastReceipt.transactionHash}`;
  }, [lastReceipt]);
  const canOpenReceiptModal = useMemo(
    () => Boolean(lastReceipt && userHasVoted && !demoMode),
    [demoMode, lastReceipt, userHasVoted]
  );
  const receiptCostSummary = useMemo(() => {
    if (!lastReceipt) {
      return {
        totalWei: "0",
        totalEth: "0",
        gasPriceGwei: "0",
        gasUsed: "0",
      };
    }
    try {
      const gasUsedValue = BigInt(lastReceipt.gasUsed || "0x0");
      const gasPriceValue = BigInt(lastReceipt.effectiveGasPrice || "0x0");
      const totalWei = (gasUsedValue * gasPriceValue).toString();
      const gasPriceGwei = formatUnits(lastReceipt.effectiveGasPrice || "0", "gwei");
      return {
        totalWei,
        totalEth: formatEther(totalWei),
        gasPriceGwei,
        gasUsed: gasUsedValue.toString(),
      };
    } catch (error) {
      console.warn("Failed to derive gas summary", error);
      return {
        totalWei: "0",
        totalEth: "0",
        gasPriceGwei: "0",
        gasUsed: "0",
      };
    }
  }, [lastReceipt]);
  const rpcSnippets = useMemo(() => {
    const txHash = lastReceipt?.transactionHash ?? "0x0";
    const blockParam = formatBlockParam(lastReceipt?.blockNumber);
    const receiptPayload = `{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionReceipt","params":["${txHash}"]}`;
    const blockPayload = `{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["${blockParam}",false]}`;
    return {
      curlReceipt: `curl -X POST ${RPC_VERIFICATION_ENDPOINT} \\\n+  -H 'Content-Type: application/json' \\\n+  -d '${receiptPayload}'`,
      curlBlock: `curl -X POST ${RPC_VERIFICATION_ENDPOINT} \\\n+  -H 'Content-Type: application/json' \\\n+  -d '${blockPayload}'`,
      jsReceipt: `const receipt = await window.ethereum.request({\n  method: 'eth_getTransactionReceipt',\n  params: ['${txHash}'],\n});`,
      jsBlock: `const block = await window.ethereum.request({\n  method: 'eth_getBlockByNumber',\n  params: ['${blockParam}', false],\n});`,
    };
  }, [lastReceipt]);
  const blockNumberForDisplay =
    blockDetails?.blockNumber ?? lastReceipt?.blockNumber ?? null;
  const blockTimestampLabel = blockDetails?.timestampLabel ??
    (blockLoading ? "블록 타임스탬프를 불러오는 중…" : "-");
  const blockTxCountLabel =
    blockDetails?.transactionCount != null
      ? `${blockDetails.transactionCount.toLocaleString("ko-KR")}`
      : blockLoading
        ? "확인 중"
        : "-";
  const modalTitleId = "vote-receipt-modal-title";
  const modalDescriptionId = "vote-receipt-modal-description";
  const totalEthDisplay = useMemo(() => {
    const numeric = Number(receiptCostSummary.totalEth);
    if (Number.isFinite(numeric) && numeric > 0) {
      return `${numeric.toPrecision(4)} ETH`;
    }
    return `${receiptCostSummary.totalEth} ETH`;
  }, [receiptCostSummary.totalEth]);
  const gasUsedDisplay = useMemo(() => {
    const numeric = Number(receiptCostSummary.gasUsed);
    if (Number.isFinite(numeric)) {
      return numeric.toLocaleString("ko-KR");
    }
    return receiptCostSummary.gasUsed;
  }, [receiptCostSummary.gasUsed]);
  const closeReceiptModal = useCallback(() => {
    setReceiptModalOpen(false);
  }, []);
  const handleOpenReceiptModal = useCallback(() => {
    if (!lastReceipt) {
      setStatus("저장된 투표 영수증이 없어요. 페이지를 새로고침해 주세요.");
      return;
    }
    setBlockError(null);
    setReceiptModalOpen(true);
  }, [lastReceipt, setStatus]);
  const handleCopyToClipboard = useCallback((value: string, label: string) => {
    if (!value) {
      return;
    }
    if (!navigator?.clipboard) {
      setCopyFeedback(`${label} 복사 기능이 지원되지 않아요.`);
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => setCopyFeedback(`${label} 복사 완료`))
      .catch(() => setCopyFeedback(`${label} 복사에 실패했어요.`));
  }, []);
  const fetchBlockDetails = useCallback(async () => {
    if (!lastReceipt?.blockNumber) {
      setBlockDetails(null);
      setBlockError(null);
      return;
    }
    if (demoMode) {
      setBlockDetails(null);
      setBlockError("데모 모드에서는 실제 블록 데이터를 불러오지 않아요.");
      return;
    }

    setBlockLoading(true);
    setBlockError(null);
    try {
      const web3Instance = getWeb3();
      const block = await web3Instance.eth.getBlock(lastReceipt.blockNumber);
      setBlockDetails({
        blockNumber: toNumberOrNull(block?.number) ?? lastReceipt.blockNumber,
        hash: toHashString(block?.hash),
        parentHash: toHashString(block?.parentHash),
        timestampLabel: formatBlockTimestamp(block?.timestamp),
        transactionCount: Array.isArray(block?.transactions)
          ? block.transactions.length
          : toNumberOrNull((block as any)?.transactions?.length ?? null),
      });
    } catch (error) {
      console.error("Failed to fetch block info", error);
      setBlockError("RPC에서 블록 정보를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBlockLoading(false);
    }
  }, [demoMode, lastReceipt?.blockNumber]);

  const redirectToVerification = useCallback(() => {
    resetVerificationFlow();
    navigate("/email-verification");
  }, [navigate, resetVerificationFlow]);

  const loadBallotMetadata = useCallback(async () => {
    console.log('[loadBallotMetadata] Starting...');
    try {
      const metadata = await fetchBallotMetadata();
      console.log('[loadBallotMetadata] Received metadata:', metadata);

      const normalizeTimestamp = (value: number | null | undefined): string => {
        if (!value || value <= 0) {
          console.warn('[normalizeTimestamp] Invalid value:', value);
          return "";
        }

        try {
          // Value should already be in milliseconds from getUint()
          // But check if it might be in seconds (legacy behavior)
          let milliseconds: number;

          if (value < 1e12) {
            // Likely seconds (< year 2001 in milliseconds)
            milliseconds = value * 1000;
            console.log(`[normalizeTimestamp] Detected seconds, converting: ${value} -> ${milliseconds}ms`);
          } else {
            // Already in milliseconds
            milliseconds = value;
          }

          const date = new Date(milliseconds);
          if (isNaN(date.getTime())) {
            console.error(`[normalizeTimestamp] Invalid date from ${value} (${milliseconds}ms)`);
            return "";
          }

          const result = date.toISOString();
          console.log(`[normalizeTimestamp] ${value}ms => ${result}`);
          return result;
        } catch (error) {
          console.error('[normalizeTimestamp] Error:', error, 'Value:', value);
          return "";
        }
      };

      const normalized: BallotMeta = {
        id: metadata.id || "onchain-ballot",
        title: metadata.title || "준비 중인 투표",
        description:
          metadata.description ||
          "컨트랙트에서 세부 정보를 불러오지 못했어요.",
        opensAt: normalizeTimestamp(metadata.opensAt),
        closesAt: normalizeTimestamp(metadata.closesAt),
        announcesAt: normalizeTimestamp(metadata.announcesAt),
        expectedVoters: metadata.expectedVoters,
      };

      console.log('[loadBallotMetadata] Normalized:', normalized);
      setBallots([normalized]);
      setActiveBallot((previous) =>
        previous && previous.id === normalized.id ? normalized : normalized
      );
    } catch (error) {
      console.error("[loadBallotMetadata] Error:", error);
      console.warn("Failed to load ballot metadata:", error);
      setBallots(FALLBACK_BALLOTS);
      setActiveBallot(FALLBACK_BALLOTS[0]);
    }
  }, []);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const web3Instance = getWeb3();
      const proposals = await fetchProposals();
      const accounts = await web3Instance.eth.getAccounts();
      const primaryAccount = accounts[0] ?? null;

      if (primaryAccount) {
        setCurrentUser(shortenAddress(primaryAccount));
        try {
          const already = await hasVoted(primaryAccount);
          setUserHasVoted(already);
        } catch (voteError) {
          console.warn("Failed to check voter status:", voteError);
        }
      } else {
        setCurrentUser("익명 유권자");
        setUserHasVoted(false);
      }

      const enriched: CandidateRecord[] = proposals.map((proposal: Proposal) => {
        const meta = metaMap.get(proposal.name);
        return {
          id: proposal.id,
          name: proposal.name,
          votes: proposal.voteCount,
          description:
            meta?.description ?? "커뮤니티가 선택한 주요 후보입니다.",
          accent: meta?.accent ?? "linear-gradient(135deg, #1f2937, #3b4b80)",
          icon: meta?.icon ?? "🗳️",
          pledges:
            meta?.pledges && meta.pledges.length > 0
              ? meta.pledges
              : [meta?.description ?? "공약이 준비 중입니다."],
        };
      });

      enriched.sort((a, b) => b.votes - a.votes);
      setCandidates(enriched);
      setDemoMode(false);
      const voteSum = proposals.reduce(
        (accumulator, proposal) => accumulator + proposal.voteCount,
        0
      );
      setTotalVotes(voteSum);
      setTurnoutPercent(
        calculateTurnout(voteSum, activeBallot.expectedVoters)
      );
      setStatus("");
    } catch (error) {
      console.error(error);
      setCandidates(FALLBACK_CANDIDATES.map((candidate) => ({ ...candidate })));
      setDemoMode(true);
      setStatus("데모 모드입니다. 네트워크가 연결되면 실시간 데이터로 전환돼요.");
      const fallbackVoteSum = FALLBACK_CANDIDATES.reduce(
        (accumulator, candidate) => accumulator + candidate.votes,
        0
      );
      setTotalVotes(fallbackVoteSum);
      setTurnoutPercent(
        activeBallot.turnout ??
        calculateTurnout(fallbackVoteSum, activeBallot.expectedVoters)
      );
      setUserHasVoted(Boolean(readLastVoteSnapshot()));
    } finally {
      setLoading(false);
    }
  }, [activeBallot, metaMap]);

  const connectWallet = useCallback(async () => {
    if (!hasBrowserWallet()) {
      setStatus(
        "브라우저 지갑이 감지되지 않았어요. MetaMask 또는 호환 지갑을 설치해 주세요."
      );
      return;
    }

    try {
      setStatus("지갑 연결을 요청하고 있어요…");
      await ensureWalletConnection();
      await loadCandidates();
      setStatus("지갑 연결이 완료됐어요.");
    } catch (error: any) {
      console.error(error);
      if (error?.code === 4001) {
        setStatus("지갑 연결 요청이 거절됐어요. 창을 다시 열어 승인해 주세요.");
        return;
      }
      setStatus(
        error?.message ??
        `지갑 연결에 실패했어요. ${expectedChainLabel} 체인을 사용 중인지 확인해 주세요.`
      );
    }
  }, [expectedChainLabel, loadCandidates]);

  const handleDisconnect = useCallback(async () => {
    const clearAndRedirect = () => {
      setCurrentUser("익명 유권자");
      setUserHasVoted(false);
      setLastReceipt(null);
      setLastCandidateId(null);
      setLastCandidateName(null);
      persistLastVoteSnapshot(null);
      sessionStorage.clear();
      localStorage.removeItem("walletAddress");
      redirectToVerification();
    };

    if (!window.confirm("지갑 연결을 해제하시겠습니까?\n\nMetaMask에서 직접 연결을 해제하려면:\n1. MetaMask 확장 프로그램 클릭\n2. 연결된 사이트 관리\n3. 이 사이트 연결 해제")) {
      return;
    }

    if (!hasBrowserWallet()) {
      setStatus("연결된 지갑이 없어 UI 상태만 초기화했어요.");
      clearAndRedirect();
      return;
    }

    try {
      await disconnectWallet();
      setStatus("지갑 연결을 해제했어요.");
    } catch (error) {
      console.error(error);
      setStatus("지갑 연결 해제에 실패했어요. 지갑에서 직접 연결을 종료해 주세요.");
    } finally {
      clearAndRedirect();
    }
  }, [redirectToVerification]);

  useEffect(() => {
    void loadBallotMetadata();
  }, [loadBallotMetadata]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }
    const id = window.setTimeout(() => setCopyFeedback(""), 2500);
    return () => window.clearTimeout(id);
  }, [copyFeedback]);

  useEffect(() => {
    if (!receiptModalOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeReceiptModal();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        focusableSelector
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => {
      if (!modalRef.current) {
        return;
      }
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        focusableSelector
      );
      focusable[0]?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [receiptModalOpen]);

  useEffect(() => {
    if (!receiptModalOpen) {
      return;
    }
    void fetchBlockDetails();
  }, [fetchBlockDetails, receiptModalOpen]);

  const handleVote = async (candidate: CandidateRecord): Promise<void> => {
    if (demoMode) {
      setCandidates((previous) =>
        previous.map((entry) =>
          entry.id === candidate.id
            ? { ...entry, votes: entry.votes + 1 }
            : entry
        )
      );
      setStatus("데모 모드에서 투표를 반영했어요. 실제 네트워크가 연결되면 서명이 필요합니다.");
      return;
    }

    if (userHasVoted) {
      if (lastCandidateId === candidate.id && lastCandidateName) {
        setStatus(
          `이미 ${lastCandidateName} 후보에게 투표가 기록됐어요. '내 투표 확인하기' 버튼을 이용해 주세요.`
        );
      } else if (lastCandidateName) {
        setStatus(`이미 ${lastCandidateName} 후보에게 투표했어요. 새 투표는 허용되지 않습니다.`);
      } else if (lastReceipt?.blockNumber) {
        setStatus(`이미 블록 #${lastReceipt.blockNumber}에 투표가 포함됐어요.`);
      } else {
        setStatus("이미 투표를 완료하셨습니다.");
      }
      return;
    }

    if (!isBallotOpen(activeBallot)) {
      setStatus("선택한 투표는 현재 진행 중이 아니에요.");
      return;
    }

    try {
      setStatus(`'${candidate.name}' 후보에게 투표 트랜잭션을 전송 중입니다…`);
      const receipt = await castVote(candidate.id);
      const normalizedReceipt = normalizeReceipt(receipt);
      setLastReceipt(normalizedReceipt);
      setLastCandidateId(candidate.id);
      setLastCandidateName(candidate.name);
      persistLastVoteSnapshot({
        version: LAST_VOTE_STORAGE_VERSION,
        candidateId: candidate.id,
        candidateName: candidate.name,
        receipt: normalizedReceipt,
      });
      setStatus(
        `블록 #${normalizedReceipt.blockNumber ?? "확인 중"}에 포함 완료! '내 투표 확인하기' 버튼에서 세부 정보를 확인하세요.`
      );
      setUserHasVoted(true);
      window.setTimeout(() => {
        void loadCandidates();
      }, OPTIMISTIC_REFRESH_DELAY_MS);
    } catch (error: any) {
      console.error(error);
      if (error?.code === 4001) {
        setStatus("서명 요청이 지갑에서 거절됐어요. 서명을 승인해야 투표가 완료됩니다.");
        return;
      }
      setStatus(
        error?.message ??
        "투표에 실패했어요. 지갑 연결과 네트워크를 다시 확인해 주세요."
      );
    }
  };

  const handleBallotSelect = (ballot: BallotMeta) => {
    setActiveBallot(ballot);
    setStatus("");
  };

  const openPledgeModal = (candidate: CandidateRecord) => {
    setPledgeModal(candidate);
  };

  const closePledgeModal = () => setPledgeModal(null);

  useEffect(() => {
    const computeRemaining = () => {
      if (!activeBallot) {
        setTimeToClose("-");
        setTimeToAnnounce("-");
        return;
      }

      const now = new Date();
      const closing = new Date(activeBallot.closesAt);
      const announcement = new Date(activeBallot.announcesAt);

      setTimeToClose(
        formatRemaining(closing.getTime() - now.getTime(), "마감 완료")
      );
      setTimeToAnnounce(
        formatRemaining(announcement.getTime() - now.getTime(), "발표 완료")
      );
    };

    computeRemaining();
    const id = window.setInterval(computeRemaining, 1000);
    return () => window.clearInterval(id);
  }, [activeBallot]);

  useEffect(() => {
    async function detectUser() {
      try {
        const web3Instance = getWeb3();
        const accounts = await web3Instance.eth.getAccounts();
        const primaryAccount = accounts[0];

        if (!primaryAccount) {
          redirectToVerification();
          return;
        }

        const hasSBT = await checkHasSBT(primaryAccount);
        if (!hasSBT) {
          redirectToVerification();
          return;
        }

        setCurrentUser(shortenAddress(primaryAccount));

        try {
          const already = await hasVoted(primaryAccount);
          setUserHasVoted(already);
        } catch (checkError) {
          console.warn("Unable to determine vote status:", checkError);
        }
      } catch (error) {
        console.warn("Account detection failed:", error);
        redirectToVerification();
      }
    }

    void detectUser();
  }, [redirectToVerification]);

  useEffect(() => {
    const unsubscribeAccounts = onAccountsChanged(async (accounts) => {
      if (!accounts.length) {
        setCurrentUser("익명 유권자");
        setUserHasVoted(false);
        setStatus("지갑 연결이 해제됐어요.");
        redirectToVerification();
        return;
      }

      const primaryAccount = accounts[0];
      setCurrentUser(shortenAddress(primaryAccount));
      try {
        const already = await hasVoted(primaryAccount);
        setUserHasVoted(already);
      } catch (eventError) {
        console.warn(
          "Unable to refresh vote status after account change:",
          eventError
        );
      }
      setStatus("지갑 계정을 변경했어요. 데이터를 새로고침합니다.");
      await loadCandidates();
    });

    const unsubscribeChain = onChainChanged(async (chainId) => {
      if (!isExpectedChain(chainId)) {
        setStatus(
          `지갑이 ${expectedChainLabel} 이외의 체인에 연결됐어요. MetaMask에서 네트워크를 전환해 주세요.`
        );
        setDemoMode(true);
        return;
      }

      setStatus("지갑 체인이 전환돼 데이터를 새로고침했어요.");
      await loadCandidates();
    });

    return () => {
      unsubscribeAccounts();
      unsubscribeChain();
    };
  }, [expectedChainLabel, loadCandidates, redirectToVerification]);

  useEffect(() => {
    if (!pledgeModal) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPledgeModal(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pledgeModal]);

  const walletConnected = currentUser !== "익명 유권자";

  return (
    <div className="voting-app-container">
      <section className="layout">
        <div className="layout-top">
          <aside className="nav-panel">
            <div className="nav-brand">
              <span className="nav-mark">A</span>
              <span className="nav-title">AGORA</span>
            </div>

            <div className="nav-section">
              <span className="nav-section-label">투표 목록</span>
              <ul className="nav-list">
                {ballots.map((ballot) => {
                  const isActive = ballot.id === activeBallot.id;
                  return (
                    <li key={ballot.id}>
                      <button
                        type="button"
                        className={`nav-item ${isActive ? "nav-item--active" : ""}`}
                        onClick={() => handleBallotSelect(ballot)}
                      >
                        <div className="nav-item__text">
                          <strong>{ballot.title}</strong>
                          <span>{formatBallotStatus(deriveBallotStatus(ballot))}</span>
                        </div>
                        <time dateTime={ballot.closesAt}>
                          {formatDate(ballot.closesAt)}
                        </time>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="nav-section">
              <span className="nav-section-label">내 정보</span>
              <div className="nav-card">
                <div className="nav-card__title">지갑 주소</div>
                <div className="nav-card__content">{currentUser}</div>
              </div>
              <button
                type="button"
                className="wallet-button wallet-button--nft"
                onClick={() => navigate("/my-nfts")}
              >
                📦 내 NFT 컬렉션 보기
              </button>
              <button
                type="button"
                className="wallet-button"
                onClick={() => void connectWallet()}
              >
                {walletConnected ? "새로고침" : "지갑 연결하기"}
              </button>
              {walletConnected && (
                <button
                  type="button"
                  className="wallet-button wallet-button--secondary"
                  onClick={() => void handleDisconnect()}
                >
                  지갑 연결 해제
                </button>
              )}
            </div>
          </aside>

          <div className="hero-card">
            <div className="hero-main">
              <span
                className={`hero-chip hero-chip--${activeStatus === "진행 중" ? "open" : "closed"
                  }`}
              >
                {activeStatus === "진행 중" ? "Ongoing Vote" : "Closed Vote"}
              </span>
              <h1 className="hero-heading">{activeBallot.title}</h1>
              <p className="hero-subheading">{activeBallot.description}</p>
            </div>

            <div className="hero-insights">
              <div className="turnout-card">
                <TurnoutGauge percent={turnoutPercent} />
              </div>
              <div className="meta-grid">
                <div className="meta-item">
                  <span className="meta-label">투표 상태</span>
                  <strong>{formatBallotStatus(activeStatus)}</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">현재 참여 인원</span>
                  <strong>{totalVotes.toLocaleString("ko-KR")}명</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">마감시간</span>
                  <strong>{formatDate(activeBallot.closesAt)}</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">투표 마감까지</span>
                  <strong>{timeToClose}</strong>
                </div>
                <div className="meta-item">
                  <span className="meta-label">발표까지 남은 시간</span>
                  <strong>{timeToAnnounce}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="status-banner status-banner--loading">
            실시간 데이터를 불러오고 있어요…
          </div>
        )}

        {countingInProgress && (
          <div className="status-banner status-banner--counting">
            <strong>⏳ 개표 진행 중</strong>
            <p>투표가 마감되었습니다. 결과는 {formatDate(activeBallot.announcesAt)}에 발표됩니다.</p>
          </div>
        )}

        {status && !loading && (
          <div
            className={`status-banner ${demoMode ? "status-banner--demo" : "status-banner--info"
              }`}
          >
            {status}
          </div>
        )}

        <div className="candidate-grid">
          {candidates.map((candidate) => {
            // 결과 발표 후 최다득표자 확인
            const maxVotes = Math.max(...candidates.map(c => c.votes));
            const isWinner = revealResults && candidate.votes === maxVotes && maxVotes > 0;
            const isMyVoteCandidate = Boolean(
              canOpenReceiptModal && lastCandidateId === candidate.id
            );
            const buttonDisabled = isMyVoteCandidate
              ? false
              : userHasVoted || countingInProgress || (!isBallotOpen(activeBallot) && !demoMode);
            const buttonLabel = isMyVoteCandidate
              ? "내 투표 확인하기"
              : countingInProgress
                ? "투표 마감됨"
                : (!isBallotOpen(activeBallot) && !demoMode)
                  ? "투표 불가"
                  : userHasVoted && !demoMode
                    ? "이미 투표 완료"
                    : "지금 투표하기";

            return (
              <article
                key={candidate.name}
                className={`candidate-card ${isWinner ? 'candidate-card--winner' : ''} ${isMyVoteCandidate ? 'candidate-card--selected' : ''}`}
                style={{ backgroundImage: candidate.accent }}
              >
                <header>
                  <span className="candidate-icon">{candidate.icon}</span>
                  <div>
                    <h2>
                      {candidate.name}
                      {isWinner && <span className="winner-badge">🏆 당선</span>}
                    </h2>
                    <span className="candidate-votes">
                      {revealResults
                        ? `${candidate.votes.toLocaleString("ko-KR")} 표`
                        : "집계 중"}
                    </span>
                  </div>
                </header>
                <footer>
                  <div className="candidate-actions">
                    <button
                      type="button"
                      className="candidate-pledge"
                      onClick={() => openPledgeModal(candidate)}
                    >
                      공약 보기
                    </button>
                    <button
                      type="button"
                      className={`candidate-button ${isMyVoteCandidate ? "candidate-button--secondary" : ""}`}
                      disabled={buttonDisabled}
                      onClick={() =>
                        isMyVoteCandidate
                          ? handleOpenReceiptModal()
                          : void handleVote(candidate)
                      }
                    >
                      {buttonLabel}
                    </button>
                  </div>
                  <span className="candidate-footnote">
                    {isMyVoteCandidate
                      ? "내 표가 이 후보에게 기록됐어요"
                      : "익명 서명 · 온체인 영구 기록"}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>

        {lastReceipt && receiptModalOpen && (
          <div
            className="vote-modal-overlay"
            role="presentation"
            onClick={closeReceiptModal}
          >
            <div
              className="vote-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={modalTitleId}
              aria-describedby={modalDescriptionId}
              onClick={(event) => event.stopPropagation()}
              ref={modalRef}
            >
              <header className="vote-modal__header">
                <div>
                  <p className="vote-modal__eyebrow">내 투표 확인하기</p>
                  <h3 id={modalTitleId}>
                    블록 #{blockNumberForDisplay ?? "확인 중"}{" "}
                    <span className="vote-modal__status">{lastReceipt.statusLabel}</span>
                  </h3>
                  <p id={modalDescriptionId} className="vote-modal__description">
                    {lastCandidateName
                      ? `${lastCandidateName} 후보에게 기록된 표입니다.`
                      : "이 트랜잭션은 영구적으로 블록체인에 저장됐어요."}
                  </p>
                </div>
                <button
                  type="button"
                  className="vote-modal__close"
                  onClick={closeReceiptModal}
                >
                  닫기
                </button>
              </header>

              <section className="vote-modal__section">
                <div className="vote-modal__row">
                  <div>
                    <span className="vote-modal__label">트랜잭션 해시</span>
                    <code className="vote-modal__code">{lastReceipt.transactionHash}</code>
                  </div>
                  <div className="vote-modal__row-actions">
                    <button
                      type="button"
                      className="copy-button"
                      onClick={() => handleCopyToClipboard(lastReceipt.transactionHash, "트랜잭션 해시")}
                    >
                      복사
                    </button>
                    {explorerTxUrl && (
                      <a
                        className="vote-modal__explorer"
                        href={explorerTxUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        익스플로러에서 열기
                      </a>
                    )}
                  </div>
                </div>
              </section>

              <section className="vote-modal__section">
                <div className="vote-modal__grid">
                  <div className="vote-modal__cell">
                    <span className="vote-modal__label">블록 번호</span>
                    <strong>#{blockNumberForDisplay ?? "확인 중"}</strong>
                    {blockNumberForDisplay != null && (
                      <button
                        type="button"
                        className="copy-button"
                        onClick={() => handleCopyToClipboard(blockNumberForDisplay.toString(), "블록 번호")}
                      >
                        복사
                      </button>
                    )}
                  </div>
                  <div className="vote-modal__cell">
                    <span className="vote-modal__label">블록 타임스탬프</span>
                    <strong>{blockTimestampLabel}</strong>
                  </div>
                  <div className="vote-modal__cell">
                    <span className="vote-modal__label">해당 블록 내 트랜잭션</span>
                    <strong>
                      {blockTxCountLabel === "-"
                        ? "확인 불가"
                        : blockTxCountLabel === "확인 중"
                          ? "확인 중"
                          : `${blockTxCountLabel}건`}
                    </strong>
                  </div>
                </div>
                {blockLoading && (
                  <p className="vote-modal__hint">블록 정보를 불러오는 중…</p>
                )}
                {blockError && (
                  <div className="vote-modal__error">
                    <p>{blockError}</p>
                    <button type="button" onClick={() => void fetchBlockDetails()}>
                      다시 시도
                    </button>
                  </div>
                )}
              </section>

              <section className="vote-modal__section">
                <h4>가스 사용 요약</h4>
                <ul className="vote-modal__list">
                  <li>
                    <span>Gas Used</span>
                    <strong>{gasUsedDisplay} 단위</strong>
                  </li>
                  <li>
                    <span>Effective Gas Price</span>
                    <strong>{receiptCostSummary.gasPriceGwei} Gwei</strong>
                  </li>
                  <li>
                    <span>총 비용</span>
                    <strong>{totalEthDisplay}</strong>
                  </li>
                </ul>
              </section>

              <section className="vote-modal__section">
                <h4>RPC로 직접 검증하기</h4>
                <p className="vote-modal__hint">
                  RPC 엔드포인트: <code className="vote-modal__code-inline">{RPC_VERIFICATION_ENDPOINT}</code>
                </p>
                <p className="vote-modal__hint">
                  아래 명령어를 실행하면 지갑 UI 없이도 동일한 결과를 확인할 수 있어요.
                </p>
                <div className="vote-modal__code-block">
                  <strong>curl &ndash; Receipt</strong>
                  <pre>{rpcSnippets.curlReceipt}</pre>
                </div>
                <div className="vote-modal__code-block">
                  <strong>curl &ndash; Block</strong>
                  <pre>{rpcSnippets.curlBlock}</pre>
                </div>
                <div className="vote-modal__code-block">
                  <strong>JavaScript</strong>
                  <pre>{`${rpcSnippets.jsReceipt}\n${rpcSnippets.jsBlock}`}</pre>
                </div>
              </section>

              {explorerTxUrl && (
                <section className="vote-modal__section vote-modal__qr">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                      explorerTxUrl
                    )}`}
                    alt="트랜잭션 해시를 열 수 있는 QR 코드"
                  />
                  <p>모바일에서 스캔하면 같은 정보를 바로 확인할 수 있어요.</p>
                </section>
              )}

              {copyFeedback && (
                <p className="sr-only" role="status" aria-live="polite">
                  {copyFeedback}
                </p>
              )}
            </div>
          </div>
        )}

        {pledgeModal && (
          <div
            className="pledge-modal-overlay"
            role="presentation"
            onClick={closePledgeModal}
          >
            <div
              className="pledge-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pledge-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="pledge-modal__header">
                <div>
                  <span className="pledge-modal__label">공약</span>
                  <h3 id="pledge-modal-title">{pledgeModal.name}</h3>
                </div>
                <button
                  type="button"
                  className="pledge-modal__close"
                  onClick={closePledgeModal}
                >
                  닫기
                </button>
              </header>
              <div className="pledge-modal__body">
                <ul>
                  {(pledgeModal.pledges ?? [pledgeModal.description]).map(
                    (pledge, index) => (
                      <li key={`${pledgeModal.name}-${index}`}>{pledge}</li>
                    )
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
} type BallotStatus = "진행 중" | "예정" | "마감" | "개표 중";

function deriveBallotStatus(
  ballot: BallotMeta,
  referenceMs = Date.now()
): BallotStatus {
  const opensAtMs = parseBallotTimestamp(ballot.opensAt);
  const closesAtMs = parseBallotTimestamp(ballot.closesAt);
  const announcesAtMs = parseBallotTimestamp(ballot.announcesAt);

  if (opensAtMs !== null && referenceMs < opensAtMs) {
    return "예정";
  }
  if (closesAtMs !== null && referenceMs > closesAtMs) {
    // 투표는 마감되었지만, 결과 발표 전
    if (announcesAtMs !== null && referenceMs < announcesAtMs) {
      return "개표 중";
    }
    return "마감";
  }
  return "진행 중";
}

function isBallotOpen(ballot: BallotMeta): boolean {
  return deriveBallotStatus(ballot) === "진행 중";
}

function parseBallotTimestamp(value: string): number | null {
  if (!value) {
    return null;
  }
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp) || !Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

function formatRemaining(ms: number, pastLabel = "곧 공개"): string {
  if (Number.isNaN(ms) || !Number.isFinite(ms)) {
    return "-";
  }

  if (ms <= 0) {
    return pastLabel;
  }

  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}일 ${hours}시간`;
  }
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  return `${minutes}분 ${seconds % 60}초`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "일정 미정";
  }

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenAddress(address: string): string {
  if (!address) {
    return "익명 유권자";
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatBallotStatus(status: string): string {
  switch (status) {
    case "진행 중":
      return "진행 중";
    case "예정":
      return "곧 시작";
    case "개표 중":
      return "개표 중";
    case "마감":
      return "마감됨";
    default:
      return status;
  }
}

function normalizeReceipt(receipt: TransactionReceipt): NormalizedReceipt {
  const gasUsedValue = stringifyNumericLike(receipt.gasUsed);
  const effectiveGasPriceValue = stringifyNumericLike(
    receipt.effectiveGasPrice
  );
  const transactionHash = toHashString(receipt.transactionHash);
  const blockNumber = toNumberOrNull(receipt.blockNumber);
  const isSuccess = coerceStatus(receipt.status);
  return {
    statusLabel: isSuccess ? "성공" : "실패",
    displayHash: formatHashForDisplay(transactionHash),
    transactionHash,
    blockNumber,
    gasUsed: gasUsedValue,
    effectiveGasPrice: effectiveGasPriceValue,
    confirmations: 0,
  };
}

function formatHashForDisplay(hash: string): string {
  if (!hash) {
    return "";
  }
  if (hash.length <= 14) {
    return hash;
  }
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function formatBlockTimestamp(value: unknown): string {
  const parsed = toNumberOrNull(value);
  if (parsed == null) {
    return "-";
  }
  const ms = parsed > 1e12 ? parsed : parsed * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatBlockParam(blockNumber: number | null | undefined): string {
  if (blockNumber == null) {
    return "latest";
  }
  return `0x${blockNumber.toString(16)}`;
}

function stringifyNumericLike(value: unknown): string {
  if (value == null) {
    return "0";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  return String(value);
}

function toHashString(value: string | Uint8Array | null | undefined): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  const hex = Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceStatus(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "bigint") {
    return value !== BigInt(0);
  }
  if (typeof value === "string") {
    return value === "0x1" || value === "1";
  }
  return true;
}

function readLastVoteSnapshot(): StoredVotePayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LAST_VOTE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredVotePayload | null;
    if (!parsed || parsed.version !== LAST_VOTE_STORAGE_VERSION) {
      window.sessionStorage.removeItem(LAST_VOTE_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse last vote snapshot", error);
    return null;
  }
}

function persistLastVoteSnapshot(payload: StoredVotePayload | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (!payload) {
      window.sessionStorage.removeItem(LAST_VOTE_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      LAST_VOTE_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch (error) {
    console.warn("Failed to persist last vote snapshot", error);
  }
}

function TurnoutGauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const strokeWidth = 16;

  return (
    <div className="turnout-gauge">
      <svg viewBox="0 0 200 200" className="turnout-svg">
        <circle
          className="turnout-track"
          cx="100"
          cy="100"
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="turnout-progress"
          cx="100"
          cy="100"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="turnout-value">
        <span>투표율</span>
        <strong>{clamped.toFixed(1)}%</strong>
      </div>
    </div>
  );
}
