import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import useEmailVerificationStore from '../../stores/emailVerificationStore';
import { EmailVerificationAPI } from '../../lib/emailVerificationApi';
import { isEmailValid, isDomainAllowed, getAllowedDomains } from '../../lib/emailUtils';
import { connectWallet, switchNetwork } from '../../lib/web3';
import { getConfig } from '../../lib/config';
import EmailInput from '../components/EmailInput';
import WalletConnector from '../components/WalletConnector';

// 간단한 디바운스 함수 (lodash 없이 직접 구현)
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

export default function EmailInputStep() {
    const {
        email,
        walletAddress,
        setEmail,
        setWallet,
        setCodeSent,
        setCompleted,
        setError,
        setLoading,
        isLoading,
        error
    } = useEmailVerificationStore();
    const navigate = useNavigate();

    const [emailError, setEmailError] = useState<string | null>(null);
    const allowedDomains = getAllowedDomains();

    const validateEmail = useMemo(
        () =>
            debounce((value: string) => {
                if (!value) {
                    setEmailError(null);
                    return;
                }

                if (!isEmailValid(value)) {
                    setEmailError('유효한 이메일 형식이 아닙니다.');
                    return;
                }

                if (!isDomainAllowed(value, allowedDomains)) {
                    setEmailError(`허용된 도메인: ${allowedDomains.join(', ')}`);
                    return;
                }

                setEmailError(null);
            }, 500),
        [allowedDomains]
    );

    const handleEmailChange = (value: string) => {
        setEmail(value);
        validateEmail(value);
    };

    const handleConnectWallet = async () => {
        try {
            setLoading(true);
            const accounts = await connectWallet();

            if (accounts.length === 0) {
                throw new Error('지갑 연결에 실패했습니다.');
            }

            await switchNetwork(
                getConfig().CHAIN_ID,
                getConfig().CHAIN_NAME,
                getConfig().RPC_URL
            );

            setWallet(accounts[0]);
            setLoading(false);
        } catch (err: any) {
            setError(err.message || '지갑 연결 중 오류가 발생했습니다.');
        }
    };

    const handleRequestCode = async () => {
        if (!email || !walletAddress || emailError) {
            setError('이메일과 지갑을 먼저 연결해주세요.');
            return;
        }

        try {
            setLoading(true);

            let status;
            try {
                status = await EmailVerificationAPI.checkStatus(walletAddress);
            } catch (statusError) {
                console.warn('checkStatus failed, continuing with code request', statusError);
            }

            if (status?.status === 'COMPLETED') {
                const accounts = await connectWallet();
                if (!accounts.length) {
                    throw new Error('지갑 연결에 실패했습니다.');
                }

                await switchNetwork(
                    getConfig().CHAIN_ID,
                    getConfig().CHAIN_NAME,
                    getConfig().RPC_URL
                );

                setWallet(accounts[0]);
                setCompleted();
                setLoading(false);
                navigate('/voting');
                return;
            }

            await EmailVerificationAPI.requestCode({
                email,
                walletAddress
            });

            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분
            setCodeSent(expiresAt);
        } catch (err: any) {
            setError(err.message || '코드 전송에 실패했습니다.');
        }
    };

    const canSubmit = email && walletAddress && !emailError && !isLoading;

    return (
        <div className="email-input-step">
            <div className="step-header">
                <h2>1단계: 이메일 및 지갑 연결</h2>
                <p className="step-description">
                    학교 이메일로 본인 인증을 진행합니다.
                </p>
            </div>

            <EmailInput
                value={email || ''}
                onChange={handleEmailChange}
                error={emailError}
                allowedDomains={allowedDomains}
                disabled={isLoading}
            />

            <WalletConnector
                address={walletAddress}
                onConnect={handleConnectWallet}
                disabled={isLoading}
            />

            {error && (
                <div className="error-message">
                    ❌ {error}
                </div>
            )}

            <button
                className="primary-button"
                onClick={handleRequestCode}
                disabled={!canSubmit}
            >
                {isLoading ? '전송 중...' : '📧 인증 코드 받기'}
            </button>

            <div className="info-box">
                <h3>ℹ️ 안내사항</h3>
                <ul>
                    <li>허용된 도메인의 이메일만 사용할 수 있습니다.</li>
                    <li>인증 코드는 5분간 유효합니다.</li>
                    <li>지갑은 올바른 네트워크에 연결되어야 합니다.</li>
                </ul>
            </div>
        </div>
    );
}
