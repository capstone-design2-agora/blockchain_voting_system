import React, { useEffect, useState } from "react";
import { createDeposit, fetchDeposits, swapDeposits, withdrawDeposit } from "../lib/nftEscrowApi";
import type { EscrowDeposit } from "../types/nftEscrow";
import "./NFTEscrowPanel.css";
import { useCallback } from "react";

interface Props {
  wallet: string;
}

export function NFTEscrowPanel({ wallet }: Props) {
  const [deposits, setDeposits] = useState<EscrowDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({ depositId: "", nftContract: "", tokenId: "", txHash: "" });
  const [swapForm, setSwapForm] = useState({ myDepositId: "", targetDepositId: "", txHash: "" });
  const [withdrawForm, setWithdrawForm] = useState({ depositId: "", txHash: "" });

  const refresh = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const res = await fetchDeposits({ owner: wallet, status: "ACTIVE", wallet });
      setDeposits(res.deposits);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || "불러오기 실패");
    } finally {
      if (showSpinner) {
        setIsLoading(false);
      }
    }
  }, [wallet]);

  useEffect(() => {
    if (!wallet) return;
    refresh();
    const interval = window.setInterval(() => refresh(false), 10000);
    return () => window.clearInterval(interval);
  }, [wallet, refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createDeposit({
        depositId: Number(createForm.depositId),
        nftContract: createForm.nftContract,
        tokenId: createForm.tokenId,
        txHash: createForm.txHash || undefined,
        wallet
      });
      await refresh();
    } catch (err: any) {
      setError(err?.message || "등록 실패");
    }
  }

  async function handleSwap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await swapDeposits({
        myDepositId: Number(swapForm.myDepositId),
        targetDepositId: Number(swapForm.targetDepositId),
        txHash: swapForm.txHash || undefined,
        wallet
      });
      await refresh();
    } catch (err: any) {
      setError(err?.message || "스왑 실패");
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await withdrawDeposit({
        depositId: Number(withdrawForm.depositId),
        txHash: withdrawForm.txHash || undefined,
        wallet
      });
      await refresh();
    } catch (err: any) {
      setError(err?.message || "출금 실패");
    }
  }

  return (
    <div className="escrow-panel">
      <div className="escrow-panel__header">
        <div>
          <p className="escrow-panel__label">연결된 지갑</p>
          <p className="escrow-panel__wallet">{wallet}</p>
        </div>
        <button className="escrow-panel__refresh" onClick={() => refresh()} disabled={isLoading}>
          새로고침
        </button>
      </div>

      {error && <div className="escrow-panel__error">{error}</div>}
      {lastUpdated && <div className="escrow-panel__muted">마지막 업데이트: {new Date(lastUpdated).toLocaleTimeString()}</div>}

      <div className="escrow-panel__forms">
        <form className="escrow-panel__card" onSubmit={handleCreate}>
          <h3>메타데이터 등록(POST /deposits)</h3>
          <label>
            Deposit ID
            <input
              required
              value={createForm.depositId}
              onChange={(e) => setCreateForm({ ...createForm, depositId: e.target.value })}
              placeholder="on-chain depositId"
            />
          </label>
          <label>
            NFT Contract
            <input
              required
              value={createForm.nftContract}
              onChange={(e) => setCreateForm({ ...createForm, nftContract: e.target.value })}
              placeholder="0x..."
            />
          </label>
          <label>
            Token ID
            <input
              required
              value={createForm.tokenId}
              onChange={(e) => setCreateForm({ ...createForm, tokenId: e.target.value })}
            />
          </label>
          <label>
            Tx Hash (선택)
            <input value={createForm.txHash} onChange={(e) => setCreateForm({ ...createForm, txHash: e.target.value })} />
          </label>
          <button type="submit" disabled={isLoading}>
            등록
          </button>
        </form>

        <form className="escrow-panel__card" onSubmit={handleSwap}>
          <h3>스왑 기록(POST /swap)</h3>
          <label>
            내 Deposit ID
            <input
              required
              value={swapForm.myDepositId}
              onChange={(e) => setSwapForm({ ...swapForm, myDepositId: e.target.value })}
            />
          </label>
          <label>
            대상 Deposit ID
            <input
              required
              value={swapForm.targetDepositId}
              onChange={(e) => setSwapForm({ ...swapForm, targetDepositId: e.target.value })}
            />
          </label>
          <label>
            Tx Hash (선택)
            <input value={swapForm.txHash} onChange={(e) => setSwapForm({ ...swapForm, txHash: e.target.value })} />
          </label>
          <button type="submit" disabled={isLoading}>
            스왑 기록
          </button>
        </form>

        <form className="escrow-panel__card" onSubmit={handleWithdraw}>
          <h3>출금 기록(POST /withdraw)</h3>
          <label>
            Deposit ID
            <input
              required
              value={withdrawForm.depositId}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, depositId: e.target.value })}
            />
          </label>
          <label>
            Tx Hash (선택)
            <input
              value={withdrawForm.txHash}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, txHash: e.target.value })}
            />
          </label>
          <button type="submit" disabled={isLoading}>
            출금 기록
          </button>
        </form>
      </div>

      <div className="escrow-panel__list">
        <div className="escrow-panel__list-header">
          <h3>내 ACTIVE Deposits</h3>
          {isLoading && <span className="escrow-panel__pill">로딩 중</span>}
        </div>
        {deposits.length === 0 ? (
          <p className="escrow-panel__empty">아직 ACTIVE 상태의 deposit이 없습니다.</p>
        ) : (
          <ul>
            {deposits.map((d) => (
              <li key={d.id} className="escrow-panel__item">
                <div>
                  <div className="escrow-panel__item-id">#{d.id}</div>
                  <div className="escrow-panel__item-meta">
                    {d.nft_contract} · tokenId {d.token_id}
                  </div>
                </div>
                <div className="escrow-panel__item-status">{d.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
