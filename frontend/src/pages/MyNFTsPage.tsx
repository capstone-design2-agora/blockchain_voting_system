import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getWeb3, onAccountsChanged } from "../lib/web3";
import { getRewardNFTs } from "../lib/sbt";
import "./MyNFTsPage.css";

interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    requirement: number;
    earned: boolean;
}

export default function MyNFTsPage() {
    const navigate = useNavigate();
    const [nfts, setNfts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [selectedNFT, setSelectedNFT] = useState<any | null>(null);

    useEffect(() => {
        const loadNFTs = async () => {
            try {
                const web3 = getWeb3();
                const accounts = await web3.eth.getAccounts();

                if (accounts.length === 0) {
                    navigate("/auth");
                    return;
                }

                const address = accounts[0];
                setWalletAddress(address);
                const userNFTs = await getRewardNFTs(address);
                setNfts(userNFTs);
            } catch (error) {
                console.error("Error loading NFTs:", error);
            } finally {
                setLoading(false);
            }
        };

        loadNFTs();

        // 지갑 연결 상태 감지
        const unsubscribe = onAccountsChanged(async (accounts) => {
            if (accounts.length === 0) {
                // 지갑 연결 해제 시 Auth 페이지로 이동
                navigate("/auth");
            } else {
                // 지갑 변경 시 새 지갑의 NFT 로드
                const newAddress = accounts[0];
                setWalletAddress(newAddress);
                setLoading(true);

                try {
                    const userNFTs = await getRewardNFTs(newAddress);
                    setNfts(userNFTs);
                } catch (error) {
                    console.error("Error reloading NFTs:", error);
                } finally {
                    setLoading(false);
                }
            }
        });

        return () => unsubscribe();
    }, [navigate]);

    const handleDisconnect = async () => {
        console.log("🔌 연결 해제 시작...");

        try {
            // 최신 MetaMask에서 지원하는 wallet_revokePermissions 시도
            if ((window as any).ethereum) {
                console.log("📡 MetaMask 감지됨, wallet_revokePermissions 시도...");

                try {
                    const result = await (window as any).ethereum.request({
                        method: 'wallet_revokePermissions',
                        params: [{ eth_accounts: {} }]
                    });
                    console.log("✓ 지갑 연결 권한이 성공적으로 취소되었습니다.", result);
                } catch (revokeError: any) {
                    // wallet_revokePermissions를 지원하지 않는 경우
                    console.warn("⚠️ wallet_revokePermissions 실패:", revokeError);
                    console.log("에러 코드:", revokeError.code);
                    console.log("에러 메시지:", revokeError.message);

                    // 사용자에게 수동 연결 해제 안내
                    if (!window.confirm(
                        "지갑 연결을 해제하시겠습니까?\n\n" +
                        "자동 연결 해제가 지원되지 않습니다.\n" +
                        "MetaMask에서 직접 연결을 해제하려면:\n" +
                        "1. MetaMask 확장 프로그램 클릭\n" +
                        "2. 연결된 사이트 관리\n" +
                        "3. 이 사이트 연결 해제"
                    )) {
                        console.log("❌ 사용자가 연결 해제를 취소했습니다.");
                        return; // 사용자가 취소한 경우
                    }
                }
            } else {
                console.warn("⚠️ MetaMask를 찾을 수 없습니다.");
            }

            // 로컬 세션 데이터 정리
            console.log("🧹 세션 데이터 정리 중...");
            sessionStorage.clear();
            localStorage.removeItem("walletAddress");

            // Auth 페이지로 이동
            console.log("🏠 Auth 페이지로 이동");
            navigate("/auth");
        } catch (error) {
            console.error("❌ Disconnect error:", error);
            // 오류 발생 시에도 세션 정리 후 이동
            sessionStorage.clear();
            localStorage.removeItem("walletAddress");
            navigate("/auth");
        }
    };

    // 뱃지 시스템
    const badges: Badge[] = [
        { id: "first-vote", name: "첫 투표", description: "첫 번째 투표 완료", icon: "🎯", requirement: 1, earned: nfts.length >= 1 },
        { id: "active-voter", name: "활발한 투표자", description: "3번 투표 참여", icon: "🔥", requirement: 3, earned: nfts.length >= 3 },
        { id: "super-voter", name: "슈퍼 투표자", description: "5번 투표 참여", icon: "⭐", requirement: 5, earned: nfts.length >= 5 },
        { id: "master-voter", name: "투표 마스터", description: "10번 투표 참여", icon: "👑", requirement: 10, earned: nfts.length >= 10 },
        { id: "legend", name: "레전드", description: "20번 투표 참여", icon: "💎", requirement: 20, earned: nfts.length >= 20 },
        { id: "collector", name: "컬렉터", description: "NFT 수집가", icon: "🎨", requirement: 15, earned: nfts.length >= 15 },
    ];

    const earnedBadges = badges.filter(b => b.earned).length;
    const totalBadges = badges.length;
    const progressPercentage = (earnedBadges / totalBadges) * 100;

    // 다음 뱃지까지 남은 개수
    const nextBadge = badges.find(b => !b.earned);
    const nftsUntilNext = nextBadge ? nextBadge.requirement - nfts.length : 0;

    // NFT 레어도 계산
    const getRarity = (tokenId: number) => {
        if (tokenId <= 10) return { name: "레전더리", color: "#fbbf24" };
        if (tokenId <= 50) return { name: "에픽", color: "#a78bfa" };
        if (tokenId <= 200) return { name: "레어", color: "#60a5fa" };
        return { name: "커먼", color: "#94a3b8" };
    };

    // NFT 상세 보기 모달 열기
    const openNFTDetail = (nft: any) => {
        setSelectedNFT(nft);
    };

    // NFT 상세 보기 모달 닫기
    const closeNFTDetail = () => {
        setSelectedNFT(null);
    };

    if (loading) {
        return (
            <div className="nft-collection-page">
                <div className="nft-loading">
                    <div className="loading-spinner"></div>
                    <p className="loading-text">NFT 컬렉션 로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="nft-collection-page">
            <div className="nft-container">
                {/* Header */}
                <header className="nft-header">
                    <div className="nft-header-left">
                        <h1 className="nft-title">🎨 NFT 컬렉션</h1>
                        <div className="nft-wallet-info">
                            <span className="nft-wallet-badge">
                                {walletAddress?.substring(0, 6)}...{walletAddress?.substring(walletAddress.length - 4)}
                            </span>
                        </div>
                    </div>
                    <div className="nft-header-right">
                        <button className="nft-button nft-button--primary" onClick={() => navigate("/voting")}>
                            🗳️ 투표하러 가기
                        </button>
                        <button className="nft-button nft-button--secondary" onClick={handleDisconnect}>
                            🔌 연결 해제
                        </button>
                    </div>
                </header>

                {/* Stats Dashboard */}
                <div className="nft-stats">
                    <div className="stat-card">
                        <span className="stat-icon">💎</span>
                        <div className="stat-value">{nfts.length}</div>
                        <div className="stat-label">보유 NFT</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">🏆</span>
                        <div className="stat-value">{earnedBadges}/{totalBadges}</div>
                        <div className="stat-label">획득 뱃지</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">🎯</span>
                        <div className="stat-value">{nfts.length}</div>
                        <div className="stat-label">투표 참여 횟수</div>
                    </div>
                    <div className="stat-card">
                        <span className="stat-icon">⚡</span>
                        <div className="stat-value">{Math.round(progressPercentage)}%</div>
                        <div className="stat-label">컬렉션 진행도</div>
                    </div>
                </div>

                {/* Progress Section */}
                {nextBadge && (
                    <div className="progress-section">
                        <h2 className="section-title">🎯 다음 뱃지까지</h2>
                        <div className="progress-bar-container">
                            <div className="progress-bar">
                                <div className="progress-bar-fill" style={{ width: `${(nfts.length / nextBadge.requirement) * 100}%` }}>
                                    {nfts.length}/{nextBadge.requirement}
                                </div>
                            </div>
                            <div className="progress-label">
                                <span>다음 뱃지: {nextBadge.icon} {nextBadge.name}</span>
                                <span>{nftsUntilNext}개 남음</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Badges Section */}
                <div className="badges-section">
                    <h2 className="section-title">🏆 업적 뱃지</h2>
                    <div className="badges-grid">
                        {badges.map(badge => (
                            <div key={badge.id} className={`badge-card ${badge.earned ? 'earned' : 'locked'}`}>
                                {!badge.earned && <span className="badge-lock">🔒</span>}
                                <span className="badge-icon">{badge.icon}</span>
                                <div className="badge-name">{badge.name}</div>
                                <div className="badge-description">{badge.description}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* NFT Grid */}
                {nfts.length === 0 ? (
                    <div className="nft-empty-state">
                        <div className="empty-icon">📭</div>
                        <h2 className="empty-title">아직 NFT가 없습니다</h2>
                        <p className="empty-description">
                            투표에 참여하여 첫 번째 NFT를 받고 컬렉션을 시작하세요!
                        </p>
                        <button className="empty-cta" onClick={() => navigate("/voting")}>
                            첫 투표 참여하기
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="section-title">🎴 내 NFT ({nfts.length})</h2>
                        <div className="nft-grid">
                            {nfts.map((nft) => {
                                const rarity = getRarity(nft.tokenId);
                                return (
                                    <div key={nft.tokenId} className="nft-card">
                                        {/* NFT 이미지 */}
                                        {nft.imageUrl && (
                                            <div
                                                className="nft-image-container"
                                                onClick={() => openNFTDetail(nft)}
                                            >
                                                <img
                                                    src={nft.imageUrl}
                                                    alt={`NFT #${nft.tokenId}`}
                                                    className="nft-image"
                                                    onError={(e) => {
                                                        // 이미지 로드 실패 시 placeholder
                                                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="rgba(0,0,0,0.5)" font-family="sans-serif" font-size="20" dy="105" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3ENFT%3C/text%3E%3C/svg%3E';
                                                    }}
                                                />
                                                <div className="nft-image-overlay">
                                                    <span className="nft-zoom-icon">🔍</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="nft-card-header">
                                            <h3 className="nft-token-id">NFT #{nft.tokenId}</h3>
                                            <span className="nft-rarity" style={{ color: rarity.color }}>
                                                {rarity.name}
                                            </span>
                                        </div>
                                        <div className="nft-card-body">
                                            <div className="nft-info-row">
                                                <span className="nft-info-label">Ballot ID</span>
                                                <span className="nft-info-value nft-ballot-id">
                                                    {nft.ballotId}
                                                </span>
                                            </div>
                                            <div className="nft-info-row">
                                                <span className="nft-info-label">투표한 후보</span>
                                                <span className="nft-info-value">#{parseInt(nft.proposalId) + 1}</span>
                                            </div>
                                            <div className="nft-info-row" style={{ border: 'none' }}>
                                                <span className="nft-info-label">토큰 ID</span>
                                                <span className="nft-info-value">{nft.tokenId}</span>
                                            </div>
                                        </div>
                                        <div className="nft-card-footer">
                                            <span className="nft-timestamp">🕐 {new Date().toLocaleDateString('ko-KR')}</span>
                                            <button className="nft-share-btn">공유 📤</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* NFT 상세 모달 */}
            {selectedNFT && (
                <div className="nft-modal-overlay" onClick={closeNFTDetail}>
                    <div className="nft-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="nft-modal-close" onClick={closeNFTDetail}>
                            ✕
                        </button>

                        <div className="nft-modal-grid">
                            {/* 왼쪽: 이미지 */}
                            <div className="nft-modal-image-section">
                                <img
                                    src={selectedNFT.imageUrl}
                                    alt={`NFT #${selectedNFT.tokenId}`}
                                    className="nft-modal-image"
                                />
                            </div>

                            {/* 오른쪽: 상세 정보 */}
                            <div className="nft-modal-details">
                                <div className="nft-modal-header">
                                    <h2 className="nft-modal-title">NFT #{selectedNFT.tokenId}</h2>
                                    <span
                                        className="nft-modal-rarity"
                                        style={{ color: getRarity(selectedNFT.tokenId).color }}
                                    >
                                        {getRarity(selectedNFT.tokenId).name}
                                    </span>
                                </div>

                                <div className="nft-modal-info-grid">
                                    <div className="nft-modal-info-item">
                                        <span className="nft-modal-label">🗳️ Ballot ID</span>
                                        <span className="nft-modal-value">{selectedNFT.ballotId}</span>
                                    </div>

                                    <div className="nft-modal-info-item">
                                        <span className="nft-modal-label">📊 투표한 후보</span>
                                        <span className="nft-modal-value">#{parseInt(selectedNFT.proposalId) + 1}</span>
                                    </div>

                                    <div className="nft-modal-info-item">
                                        <span className="nft-modal-label">🎫 토큰 ID</span>
                                        <span className="nft-modal-value">{selectedNFT.tokenId}</span>
                                    </div>

                                    <div className="nft-modal-info-item">
                                        <span className="nft-modal-label">⏰ 발행 시간</span>
                                        <span className="nft-modal-value">
                                            {new Date().toLocaleString('ko-KR')}
                                        </span>
                                    </div>
                                </div>

                                <div className="nft-modal-description">
                                    <h3 className="nft-modal-section-title">📝 설명</h3>
                                    <p className="nft-modal-description-text">
                                        이 NFT는 {selectedNFT.ballotId} 투표에 참여한 증거로 발행되었습니다.
                                        블록체인에 영구적으로 기록되며, 투표 참여를 인증합니다.
                                    </p>
                                </div>

                                <div className="nft-modal-metadata">
                                    <h3 className="nft-modal-section-title">🔗 메타데이터</h3>
                                    <div className="nft-modal-metadata-item">
                                        <span className="nft-modal-metadata-label">IPFS URL:</span>
                                        <a
                                            href={selectedNFT.imageUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="nft-modal-link"
                                        >
                                            {selectedNFT.imageUrl.substring(0, 50)}...
                                        </a>
                                    </div>
                                </div>

                                <div className="nft-modal-actions">
                                    <button className="nft-modal-btn nft-modal-btn-primary">
                                        공유하기 📤
                                    </button>
                                    <button className="nft-modal-btn nft-modal-btn-secondary">
                                        다운로드 💾
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
