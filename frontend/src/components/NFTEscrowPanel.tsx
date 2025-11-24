import React, { useEffect, useState } from "react";
import { BrowserProvider, Contract, Interface } from "ethers";
import { createDeposit, fetchDeposits, swapDeposits, withdrawDeposit } from "../lib/nftEscrowApi";
import type { EscrowDeposit } from "../types/nftEscrow";
import "./NFTEscrowPanel.css";
import { useCallback } from "react";
import { getConfig } from "../lib/config";
import NFTEscrowAbi from "../abi/NFTEscrow.json";

interface Props {
  wallet: string;
}

export function NFTEscrowPanel({ wallet }: Props) {
  const [deposits, setDeposits] = useState<EscrowDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({ nftContract: "", tokenId: "" });
  const [swapForm, setSwapForm] = useState({ myDepositId: "", targetDepositId: "" });
  const [withdrawForm, setWithdrawForm] = useState({ depositId: "" });

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

  const getSigner = async () => {
    if (!(window as any).ethereum) {
      throw new Error("지갑이 필요합니다 (MetaMask 등)");
    }
    const provider = new BrowserProvider((window as any).ethereum);
    return provider.getSigner();
  };

  const getContract = async () => {
    const cfg = getConfig();
    if (!cfg.ESCROW_ADDRESS) {
      throw new Error("ESCROW_ADDRESS가 설정되지 않았습니다.");
    }
    const signer = await getSigner();
    return new Contract(cfg.ESCROW_ADDRESS, NFTEscrowAbi as any, signer);
  };

  const parseDepositedId = (receipt: any) => {
    const iface = new Interface(NFTEscrowAbi as any);
    for (const log of receipt.logs || []) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "Deposited") {
          return Number(parsed.args?.depositId);
        }
      } catch {
        /* ignore */
      }
    }
    return null;
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTxStatus("온체인 트랜잭션 전송 중...");
    try {
      const contract = await getContract();
      const tx = await contract.deposit(createForm.nftContract, createForm.tokenId);
      const receipt = await tx.wait();
      const depositId = parseDepositedId(receipt);
      if (!depositId) {
        throw new Error("depositId를 이벤트에서 찾을 수 없습니다.");
      }
      setTxStatus(`Tx mined: ${tx.hash}`);
      await createDeposit({
        depositId,
        nftContract: createForm.nftContract,
        tokenId: createForm.tokenId,
        txHash: tx.hash,
        wallet
      });
      await refresh();
      setCreateForm({ nftContract: "", tokenId: "" });
    } catch (err: any) {
      setError(err?.message || "등록 실패");
    } finally {
      setTxStatus(null);
    }
  }

  async function handleSwap(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTxStatus("온체인 스왑 트랜잭션 전송 중...");
    try {
      const contract = await getContract();
      const tx = await contract.swap(Number(swapForm.myDepositId), Number(swapForm.targetDepositId));
      await tx.wait();
      setTxStatus(`Tx mined: ${tx.hash}`);
      await swapDeposits({
        myDepositId: Number(swapForm.myDepositId),
        targetDepositId: Number(swapForm.targetDepositId),
        txHash: tx.hash,
        wallet
      });
      await refresh();
      setSwapForm({ myDepositId: "", targetDepositId: "" });
    } catch (err: any) {
      setError(err?.message || "스왑 실패");
    } finally {
      setTxStatus(null);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTxStatus("온체인 출금 트랜잭션 전송 중...");
    try {
      const contract = await getContract();
      const tx = await contract.withdraw(Number(withdrawForm.depositId));
      await tx.wait();
      setTxStatus(`Tx mined: ${tx.hash}`);
      await withdrawDeposit({
        depositId: Number(withdrawForm.depositId),
        txHash: tx.hash,
        wallet
      });
      await refresh();
      setWithdrawForm({ depositId: "" });
    } catch (err: any) {
      setError(err?.message || "출금 실패");
    } finally {
      setTxStatus(null);
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
      {txStatus && <div className="escrow-panel__muted">{txStatus}</div>}

      <div className="escrow-panel__forms">
        <form className="escrow-panel__card" onSubmit={handleCreate}>
          <h3>Deposit (온체인 + /deposits)</h3>
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
          <button type="submit" disabled={isLoading}>
            등록
          </button>
        </form>

        <form className="escrow-panel__card" onSubmit={handleSwap}>
          <h3>스왑 (온체인 + /swap)</h3>
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
          <button type="submit" disabled={isLoading}>
            스왑 기록
          </button>
        </form>

        <form className="escrow-panel__card" onSubmit={handleWithdraw}>
          <h3>출금 (온체인 + /withdraw)</h3>
          <label>
            Deposit ID
            <input
              required
              value={withdrawForm.depositId}
              onChange={(e) => setWithdrawForm({ ...withdrawForm, depositId: e.target.value })}
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
