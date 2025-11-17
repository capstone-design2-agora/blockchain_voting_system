import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type VerificationStep = 
  | 'IDLE'           // 초기 상태
  | 'CODE_SENT'      // 이메일 코드 전송됨
  | 'VERIFIED'       // 코드 검증 완료, 서명 수신
  | 'TX_PENDING'     // 온체인 민팅 트랜잭션 진행 중
  | 'COMPLETED';     // 전체 프로세스 완료

interface VerificationState {
  // 상태
  step: VerificationStep;
  email: string | null;
  walletAddress: string | null;
  
  // 서명 데이터 (verify-and-sign 응답)
  signature: string | null;
  identityHash: string | null;
  nonce: string | null;
  signatureExpiresAt: string | null;
  
  // 트랜잭션 추적
  txHash: string | null;
  
  // UI 상태
  isLoading: boolean;
  error: string | null;
  
  // 타이머 상태
  codeExpiresAt: Date | null;
  resendCooldownUntil: Date | null;
  
  // Actions
  setEmail: (email: string) => void;
  setWallet: (address: string | null) => void;
  setCodeSent: (expiresAt: Date) => void;
  setVerified: (data: { signature: string; identityHash: string; nonce: string; expiresAt: string }) => void;
  setTxPending: (txHash: string) => void;
  setCompleted: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
  
  // 재시도 로직
  canResendCode: () => boolean;
  isCodeExpired: () => boolean;
  isSignatureExpired: () => boolean;
}

const useEmailVerificationStore = create<VerificationState>()(
  persist(
    (set, get) => ({
      // 초기 상태
      step: 'IDLE',
      email: null,
      walletAddress: null,
      signature: null,
      identityHash: null,
      nonce: null,
      signatureExpiresAt: null,
      txHash: null,
      isLoading: false,
      error: null,
      codeExpiresAt: null,
      resendCooldownUntil: null,
      
      // Actions
      setEmail: (email) => set({ email, error: null }),
      
      setWallet: (address) => set({ walletAddress: address, error: null }),
      
      setCodeSent: (expiresAt) => set({
        step: 'CODE_SENT',
        codeExpiresAt: expiresAt,
        resendCooldownUntil: new Date(Date.now() + 60000), // 60초 쿨다운
        error: null,
        isLoading: false
      }),
      
      setVerified: (data) => set({
        step: 'VERIFIED',
        signature: data.signature,
        identityHash: data.identityHash,
        nonce: data.nonce,
        signatureExpiresAt: data.expiresAt,
        error: null,
        isLoading: false
      }),
      
      setTxPending: (txHash) => set({
        step: 'TX_PENDING',
        txHash,
        error: null,
        isLoading: true
      }),
      
      setCompleted: () => set({
        step: 'COMPLETED',
        isLoading: false,
        error: null
      }),
      
      setError: (error) => set({ error, isLoading: false }),
      
      clearError: () => set({ error: null }),
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      reset: () => set({
        step: 'IDLE',
        email: null,
        walletAddress: null,
        signature: null,
        identityHash: null,
        nonce: null,
        signatureExpiresAt: null,
        txHash: null,
        isLoading: false,
        error: null,
        codeExpiresAt: null,
        resendCooldownUntil: null
      }),
      
      // 유틸리티 함수
      canResendCode: () => {
        const state = get();
        if (!state.resendCooldownUntil) return true;
        return Date.now() > state.resendCooldownUntil.getTime();
      },
      
      isCodeExpired: () => {
        const state = get();
        if (!state.codeExpiresAt) return false;
        return Date.now() > state.codeExpiresAt.getTime();
      },
      
      isSignatureExpired: () => {
        const state = get();
        if (!state.signatureExpiresAt) return false;
        return Date.now() > new Date(state.signatureExpiresAt).getTime();
      }
    }),
    {
      name: 'email-verification-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        // 민감한 서명 데이터는 persist하되, 만료 시 자동 제거
        step: state.step,
        email: state.email,
        walletAddress: state.walletAddress,
        signature: state.signature,
        identityHash: state.identityHash,
        nonce: state.nonce,
        signatureExpiresAt: state.signatureExpiresAt,
        txHash: state.txHash
      })
    }
  )
);

export default useEmailVerificationStore;
