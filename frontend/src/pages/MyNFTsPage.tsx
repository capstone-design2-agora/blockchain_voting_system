import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { getWeb3, onAccountsChanged, hasBrowserWallet, disconnectWallet } from "../lib/web3";
import { getRewardNFTs } from "../lib/sbt";
import useEmailVerificationStore from "../stores/emailVerificationStore";
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
    const resetVerificationFlow = useEmailVerificationStore((state) => state.reset);
    const [nfts, setNfts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [selectedNFT, setSelectedNFT] = useState<any | null>(null);

    const redirectToVerification = useCallback(() => {
        resetVerificationFlow();
        navigate("/email-verification");
    }, [navigate, resetVerificationFlow]);



    useEffect(() => {
        const loadNFTs = async () => {
            try {
                const web3 = getWeb3();
                const accounts = await web3.eth.getAccounts();

                if (accounts.length === 0) {
                    redirectToVerification();
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
                redirectToVerification();
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
    }, [redirectToVerification]);

    const handleDisconnect = async () => {
        const clearAndRedirect = () => {
            setWalletAddress(null);
            setNfts([]);
            setSelectedNFT(null);
            sessionStorage.clear();
            localStorage.removeItem("walletAddress");
            redirectToVerification();
        };

        if (!window.confirm(
            "지갑 연결을 해제하시겠습니까?\n\nMetaMask에서 직접 연결을 해제하려면:\n1. MetaMask 확장 프로그램 클릭\n2. 연결된 사이트 관리\n3. 이 사이트 연결 해제"
        )) {
            return;
        }

        if (!hasBrowserWallet()) {
            clearAndRedirect();
            return;
        }

        try {
            await disconnectWallet();
        } catch (error) {
            console.error("❌ Disconnect error:", error);
        } finally {
            clearAndRedirect();
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

    // NFT 레어도 표시 (온체인 rarity 값 사용)
    const rarityColorMap: Record<string, string> = {
        "레전더리": "#f59e0b", // Amber 500 (Strong Gold)
        "에픽": "#8b5cf6",     // Violet 500 (Strong Purple)
        "레어": "#3b82f6",     // Blue 500 (Strong Blue)
        "커먼": "#64748b",     // Slate 500 (Strong Gray)
        "legendary": "#f59e0b",
        "epic": "#8b5cf6",
        "rare": "#3b82f6",
        "common": "#64748b",
    };

    const getRarityDisplay = (rarity: string | number | undefined) => {
        const labels = ["커먼", "레어", "에픽", "레전더리"];

        if (rarity === undefined || rarity === null) {
            return { name: "커먼", color: rarityColorMap["커먼"] };
        }
        // Accept numeric codes (0-3) or string labels
        if (typeof rarity === "number") {
            const name = labels[rarity] || "커먼";
            return { name, color: rarityColorMap[name] || rarityColorMap["커먼"] };
        }
        // Support numeric strings (e.g., "3")
        const numeric = Number(rarity);
        if (!Number.isNaN(numeric)) {
            const name = labels[numeric] || "커먼";
            return { name, color: rarityColorMap[name] || rarityColorMap["커먼"] };
        }
        // Direct match for Korean labels
        if (labels.includes(rarity)) {
            return { name: rarity, color: rarityColorMap[rarity] || rarityColorMap["커먼"] };
        }
        const normalized = rarity.toLowerCase();
        if (normalized.includes("legend")) return { name: "레전더리", color: rarityColorMap["레전더리"] };
        if (normalized.includes("epic")) return { name: "에픽", color: rarityColorMap["에픽"] };
        if (normalized.includes("rare")) return { name: "레어", color: rarityColorMap["레어"] };
        return { name: "커먼", color: rarityColorMap["커먼"] };
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
        return <div className="loading-container">Loading...</div>;
    }

    return (
        <div className="nft-collection-page">
            {/* Header */}
            <header className="nft-header">
                <div className="nft-header-content">
                    <div className="nft-header-title-section">
                        <div className="nft-header-icon">
                            <span style={{ fontSize: '1.5rem' }}>🎨</span>
                        </div>
                        <div>
                            <h1 className="nft-title">NFT 컬렉션</h1>
                        </div>
                    </div>
                    <div className="nft-header-actions">
                        <button className="nft-button nft-button--primary" onClick={() => navigate("/nft-exchange")}>
                            🔁 NFT 거래소
                        </button>
                        <button className="nft-button nft-button--primary" onClick={() => navigate("/voting")}>
                            🗳️ 투표하러 가기
                        </button>
                        <button className="nft-button nft-button--secondary" onClick={handleDisconnect}>
                            🔌 연결 해제
                        </button>
                    </div>
                </div>
            </header>

            <div className="nft-container">

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
                    <h2 className="section-title">🏆 업적 뱃지 <span style={{ fontSize: '0.8em', opacity: 0.8, marginLeft: '8px' }}>({earnedBadges}/{totalBadges})</span></h2>
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
                    <div className="empty-state">
                        <div className="empty-icon">🖼️</div>
                        <h3>아직 보유한 NFT가 없습니다</h3>
                        <p>투표에 참여하고 첫 NFT를 획득해보세요!</p>
                        <button className="nft-button nft-button--primary" onClick={() => navigate("/voting")}>
                            첫 투표 참여하기
                        </button>
                    </div>
                ) : (
                    <>
                        <h2 className="section-title">🎴 내 NFT ({nfts.length})</h2>
                        <div className="nft-grid">
                            {nfts.map((nft) => {
                                const rarity = getRarityDisplay(nft.rarity ?? nft.rarityCode);
                                return (
                                    <div
                                        key={nft.tokenId}
                                        className="nft-card"
                                        style={{
                                            '--rarity-color': rarity.color,
                                            borderColor: rarity.color,
                                            boxShadow: `0 0 20px -2px ${rarity.color}`
                                        } as React.CSSProperties}
                                    >
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
                                            <h3 className="nft-token-id">{nft.metadata?.name || `NFT #${nft.tokenId}`}</h3>
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
                                    <h2 className="nft-modal-title">{selectedNFT.metadata?.name || `NFT #${selectedNFT.tokenId}`}</h2>
                                    <span
                                        className="nft-modal-rarity"
                                        style={{ color: getRarityDisplay(selectedNFT.rarity ?? selectedNFT.rarityCode).color }}
                                    >
                                        {getRarityDisplay(selectedNFT.rarity ?? selectedNFT.rarityCode).name}
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
                                            {new Date(selectedNFT.mintedAt || selectedNFT.createdAt || Date.now()).toLocaleString('ko-KR')}
                                        </span>
                                    </div>
                                </div>

                                <div className="nft-modal-description">
                                    <h3 className="nft-modal-section-title">📝 설명</h3>
                                    <p className="nft-modal-description-text">
                                        {selectedNFT.metadata?.description ||
                                            `이 NFT는 ${selectedNFT.ballotId} 투표에 참여한 증거로 발행되었습니다. 블록체인에 영구적으로 기록되며, 투표 참여를 인증합니다.`}
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
