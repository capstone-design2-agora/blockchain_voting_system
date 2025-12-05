import React from 'react';
import { useNavigate } from 'react-router';
import useEmailVerificationStore from '../../stores/emailVerificationStore';

export default function CompletionStep() {
    const navigate = useNavigate();
    const { txHash, email, reset } = useEmailVerificationStore();

    const handleGoToVoting = () => {
        reset();
        navigate('/voting');
    };

    const handleGoToMyNFTs = () => {
        reset();
        navigate('/my-nfts');
    };

    return (
        <div className="completion-step">
            <div className="step-header">
                <h2>✅ SBT 발급 완료!</h2>
            </div>

            <div className="success-section">
                <div className="success-message-container">
                    <div className="success-icon">🎉</div>
                    <p className="success-message">
                        축하합니다! 이메일 인증이 완료되었고,<br />
                        Citizen SBT가 성공적으로 발급되었습니다.
                    </p>
                </div>

                {email && (
                    <div className="verified-email">
                        <strong>인증된 이메일:</strong> {email}
                    </div>
                )}

                {txHash && (
                    <div className="tx-info">
                        <strong>트랜잭션 해시:</strong>
                        <code className="tx-hash">
                            {txHash.substring(0, 10)}...{txHash.substring(txHash.length - 8)}
                        </code>
                    </div>
                )}
            </div>

            <div className="next-steps">
                <h3>다음 단계</h3>
                <p>이제 투표에 참여하거나 보유한 NFT를 확인할 수 있습니다.</p>

                <div className="action-buttons">
                    <button
                        className="primary-button"
                        onClick={handleGoToVoting}
                    >
                        🗳️ 투표하러 가기
                    </button>

                    <button
                        className="secondary-button"
                        onClick={handleGoToMyNFTs}
                    >
                        🖼️ 내 NFT 보기
                    </button>
                </div>
            </div>

            <div className="info-box">
                <h3>ℹ️ 안내사항</h3>
                <ul>
                    <li>발급된 SBT는 양도할 수 없습니다 (Soulbound Token).</li>
                    <li>하나의 지갑 주소당 하나의 SBT만 발급됩니다.</li>
                    <li>투표 참여 시 SBT 소유가 자동으로 확인됩니다.</li>
                </ul>
            </div>
        </div>
    );
}
