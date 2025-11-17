import React, { useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import useEmailVerificationStore from '../../stores/emailVerificationStore';
import { EmailVerificationAPI } from '../../lib/emailVerificationApi';
import CitizenSBTAbi from '../../abi/CitizenSBT.abi.json';

const CITIZEN_SBT_CONTRACT = process.env.REACT_APP_CITIZEN_SBT_ADDRESS!;

function nonceToBytes32(nonce: string) {
    if (!nonce) {
        throw new Error('Nonce is required');
    }

    const normalized = nonce.replace(/-/g, '').toLowerCase();

    if (/^[0-9a-f]+$/.test(normalized)) {
        const bytes = `0x${normalized}`;
        const byteLength = normalized.length / 2;

        if (byteLength === 32) {
            return bytes;
        }

        if (byteLength === 16) {
            return ethers.zeroPadValue(bytes, 32);
        }
    }

    // Fall back to hashing unexpected formats to stay in sync with the server signer logic
    return ethers.sha256(ethers.toUtf8Bytes(nonce));
}

export default function MintingStep() {
    const {
        email,
        step,
        walletAddress,
        signature,
        identityHash,
        nonce,
        signatureExpiresAt,
        txHash,
        setTxPending,
        setCompleted,
        setError,
        reset,
        isSignatureExpired
    } = useEmailVerificationStore();

    const mintTriggeredRef = useRef(false);

    useEffect(() => {
        if (step === 'VERIFIED' && !txHash) {
            if (mintTriggeredRef.current) {
                return;
            }
            mintTriggeredRef.current = true;
            mintSBT();
        } else {
            mintTriggeredRef.current = false;
        }

        if (step === 'TX_PENDING' && txHash) {
            waitForCompletion();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, txHash]);

    const mintSBT = async () => {
        if (!walletAddress || !signature || !identityHash || !nonce) {
            setError('서명 정보가 없습니다.');
            return;
        }

        if (isSignatureExpired()) {
            setError('서명이 만료되었습니다. 다시 시작해주세요.');
            return;
        }

        if (!signatureExpiresAt) {
            setError('서명 만료 정보를 확인하지 못했습니다. 다시 시도해주세요.');
            return;
        }

        const expirationMs = new Date(signatureExpiresAt).getTime();
        if (Number.isNaN(expirationMs)) {
            setError('서명 만료 시간이 유효하지 않습니다.');
            return;
        }
        const signatureExpiration = Math.floor(expirationMs / 1000); // 컨트랙트는 초 단위 Unix 타임을 기대

        try {
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();

            const contract = new ethers.Contract(
                CITIZEN_SBT_CONTRACT,
                CitizenSBTAbi,
                signer
            );

            // nonceToBytes32 변환 (UUID -> bytes32) 서버 서명 로직과 동일하게 처리
            const nonceBytes32 = nonceToBytes32(nonce);

            console.log('Minting with:', {
                walletAddress,
                identityHash,
                nonce: nonceBytes32,
                signatureExpiration,
                signature
            });

            const tx = await contract.mintWithSignature(
                walletAddress,
                identityHash,
                nonceBytes32,
                signature
            );

            setTxPending(tx.hash);

            const receipt = await tx.wait();

            if (receipt.status === 1) {
                // complete-verification API 호출
                await EmailVerificationAPI.completeVerification({
                    walletAddress,
                    txHash: tx.hash
                });

                setCompleted();
            } else {
                throw new Error('트랜잭션이 실패했습니다.');
            }
        } catch (err: any) {
            console.error('Minting error:', err);
            setError(err.message || 'SBT 발급에 실패했습니다.');
        }
    };

    const waitForCompletion = async () => {
        if (!txHash) return;

        try {
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const receipt = await provider.getTransactionReceipt(txHash);

            if (!receipt) {
                // 아직 대기 중
                setTimeout(waitForCompletion, 2000);
                return;
            }

            if (receipt.status === 1) {
                await EmailVerificationAPI.completeVerification({
                    walletAddress: walletAddress!,
                    txHash
                });
                setCompleted();
            } else {
                throw new Error('트랜잭션이 실패했습니다.');
            }
        } catch (err: any) {
            setError(err.message || '트랜잭션 확인에 실패했습니다.');
        }
    };

    const handleResetVerification = async () => {
        if (!email || !walletAddress) {
            setError('이메일 또는 지갑 정보를 확인할 수 없습니다.');
            return;
        }

        const confirmed = window.confirm('인증 과정을 초기화하시겠습니까?\n\n이전에 진행된 인증 정보가 모두 삭제됩니다.');
        if (!confirmed) {
            return;
        }

        try {
            await EmailVerificationAPI.resetVerification({ email, walletAddress });
            mintTriggeredRef.current = false;
            reset();
            alert('인증 정보가 초기화되었습니다. 처음부터 다시 진행해주세요.');
        } catch (err: any) {
            setError(err.message || '인증 초기화에 실패했습니다.');
        }
    };

    return (
        <div className="minting-step">
            <div className="step-header">
                <h2>3단계: SBT 발급 중</h2>
            </div>

            <div className="loading-section">
                <div className="spinner"></div>
                <p>블록체인에 SBT를 발급하고 있습니다...</p>
                {txHash && (
                    <p className="small-text">
                        트랜잭션: {txHash.substring(0, 10)}...{txHash.substring(txHash.length - 8)}
                    </p>
                )}
                <p className="small-text">
                    MetaMask에서 트랜잭션을 승인해주세요.
                </p>
            </div>

            <div className="gas-warning">
                ⚠️ 트랜잭션 가스비가 발생할 수 있습니다.
            </div>

            <button
                type="button"
                className="secondary-button reset-button"
                onClick={handleResetVerification}
            >
                ♻️ 인증 과정 초기화
            </button>
        </div>
    );
}
