import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { connectWallet, switchNetwork, CHAIN_ID, CHAIN_NAME, getWeb3, onAccountsChanged } from "../lib/web3";
import {
    checkHasSBT,
    checkIdentityRegistered,
    generateIdentityHash,
    mintSBT,
    getWalletByIdentity,
    VERIFIER_ADDR,
} from "../lib/sbt";
import "./RegisterPage.css";

export default function RegisterPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const name = (location.state as any)?.name;

    const [walletAddress, setWalletAddress] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isMinting, setIsMinting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);

    const checkWallet = React.useCallback(async () => {
        try {
            setIsChecking(true);
            const web3 = getWeb3();
            const accounts = await web3.eth.getAccounts();

            if (accounts.length === 0) {
                setWalletAddress(null);
                setIsChecking(false);
                return;
            }

            const address = accounts[0];
            setWalletAddress(address);

            const hasSBT = await checkHasSBT(address);
            if (hasSBT) {
                console.log(`✓ 이 지갑은 이미 SBT를 보유하고 있습니다: ${address}`);
                setTimeout(() => navigate("/voting"), 1500);
                return;
            }

            console.log(`지갑 ${address}는 SBT를 보유하지 않음 - 발급 가능`);
            setIsChecking(false);
        } catch (error: any) {
            console.error("Error checking wallet:", error);
            setError(error.message || "지갑 확인 중 오류가 발생했습니다.");
            setIsChecking(false);
        }
    }, [navigate]);

    useEffect(() => {
        if (!name) {
            navigate("/auth");
            return;
        }

        checkWallet();

        const unsubscribe = onAccountsChanged((accounts) => {
            if (accounts.length === 0) {
                setWalletAddress(null);
            } else {
                checkWallet();
            }
        });

        return () => unsubscribe();
    }, [name, navigate, checkWallet]);

    const handleConnectWallet = async () => {
        try {
            setIsConnecting(true);
            setError(null);

            // Connect wallet
            const accounts = await connectWallet();
            if (accounts.length === 0) {
                throw new Error("지갑 연결에 실패했습니다.");
            }

            // Switch to correct network
            await switchNetwork(
                CHAIN_ID,
                CHAIN_NAME,
                process.env.REACT_APP_RPC || "http://localhost:9545"
            );

            const address = accounts[0];
            setWalletAddress(address);

            // Check if already has SBT
            const hasSBT = await checkHasSBT(address);
            if (hasSBT) {
                console.log(`✓ 이 지갑은 이미 SBT를 보유하고 있습니다: ${address}`);
                setTimeout(() => navigate("/voting"), 1500);
                return;
            }

            setIsConnecting(false);
        } catch (error: any) {
            console.error("Error connecting wallet:", error);
            setError(error.message || "지갑 연결 중 오류가 발생했습니다.");
            setIsConnecting(false);
        }
    };

    const handleMintSBT = async () => {
        if (!walletAddress || !name) {
            setError("지갑 주소 또는 이름이 없습니다.");
            return;
        }

        try {
            setIsMinting(true);
            setError(null);
            setSuccess(null);

            const dummyDate = "2000-01-01";
            const identityHash = generateIdentityHash(name, dummyDate);

            const isRegistered = await checkIdentityRegistered(identityHash);
            if (isRegistered) {
                const existingWallet = await getWalletByIdentity(identityHash);
                const errorMsg = `이 신원은 이미 등록되어 있습니다.\n등록된 지갑: ${existingWallet?.substring(0, 10)}...${existingWallet?.substring(existingWallet.length - 8)}`;
                setError(errorMsg);
                setIsMinting(false);
                return;
            }

            await mintSBT(walletAddress, identityHash);

            const successMsg = `SBT가 성공적으로 발급되었습니다!`;
            setSuccess(successMsg);

            setTimeout(() => {
                navigate("/voting");
            }, 2000);
        } catch (error: any) {
            console.error("Error minting SBT:", error);
            setIsMinting(false);
            const errorMsg = error.message || "SBT 발급 중 오류가 발생했습니다.";
            setError(errorMsg);
        }
    };

    const handleBack = () => {
        navigate("/auth");
    };

    if (isChecking) {
        return (
            <div className="register-page">
                <div className="register-container">
                    <div className="loading-section">
                        <div className="spinner"></div>
                        <p>지갑 확인 중...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="register-page">
            <div className="register-container">
                <h1>🪪 SBT 발급</h1>

                <div className="wallet-info">
                    <div className="wallet-info-header">
                        <p>
                            <strong>연결된 지갑:</strong>
                        </p>
                        <span
                            className={`wallet-status ${walletAddress ? "connected" : "disconnected"}`}
                        >
                            {walletAddress ? "연결됨" : "연결 안 됨"}
                        </span>
                    </div>
                    <p
                        className={`wallet-address ${walletAddress ? "" : "placeholder"}`}
                    >
                        {walletAddress || "MetaMask에서 지갑을 연결해주세요."}
                    </p>

                    {!walletAddress && (
                        <button
                            className="connect-wallet-button"
                            onClick={handleConnectWallet}
                            disabled={isConnecting}
                        >
                            {isConnecting ? "지갑 연결 중..." : "🔗 지갑 연결하기"}
                        </button>
                    )}
                </div>

                <div className="step-indicator">
                    <div className="step completed">
                        <div className="step-number">✓</div>
                        <div className="step-label">본인 인증</div>
                    </div>
                    <div className="step-line active"></div>
                    <div className="step active">
                        <div className="step-number">2</div>
                        <div className="step-label">SBT 발급</div>
                    </div>
                </div>

                {!isMinting && !success && (
                    <div className="register-info">
                        <div className="name-display">
                            <p className="label">입력하신 이름</p>
                            <p className="value">{name}</p>
                        </div>

                        <div className="warning-box">
                            <h3>⚠️ 중요 안내</h3>
                            <ul>
                                <li>
                                    SBT는 <strong>영구적으로 지갑에 바인딩</strong>됩니다.
                                </li>
                                <li>
                                    한 번 발급받으면{" "}
                                    <strong>변경하거나 취소할 수 없습니다</strong>.
                                </li>
                                <li>올바른 지갑 주소를 사용하고 있는지 확인하세요.</li>
                                <li>동일한 신원으로 중복 등록할 수 없습니다.</li>
                            </ul>
                        </div>

                        <div className="button-group">
                            <button className="back-button" onClick={handleBack}>
                                ← 이전
                            </button>
                            <button
                                className="mint-button"
                                onClick={handleMintSBT}
                                disabled={isMinting || !walletAddress}
                            >
                                🎫 SBT 발급받기
                            </button>
                        </div>
                    </div>
                )}

                {isMinting && (
                    <div className="loading-section">
                        <div className="spinner"></div>
                        <p>SBT를 발급하고 있습니다...</p>
                        <p className="small-text">
                            MetaMask에서 트랜잭션을 승인해주세요.
                        </p>
                    </div>
                )}

                {success && (
                    <div className="success-section">
                        <div className="success-icon">✅</div>
                        <p className="success-message">{success}</p>
                        <p className="small-text">투표 페이지로 이동합니다...</p>
                    </div>
                )}

                {error && (
                    <div className="error-message">
                        <p>❌ {error}</p>
                    </div>
                )}

                <div className="verifier-info">
                    <p className="small-text">
                        <strong>검증자 주소:</strong> {VERIFIER_ADDR?.substring(0, 10)}...
                        {VERIFIER_ADDR?.substring(VERIFIER_ADDR.length - 8)}
                    </p>
                </div>
            </div>
        </div>
    );
}
