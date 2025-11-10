import Web3 from "web3";

const RPC_URL = process.env.REACT_APP_RPC || "http://localhost:9545";

let web3Instance: Web3 | null = null;

export function getWeb3(): Web3 {
    if (!web3Instance) {
        if (typeof window !== "undefined" && (window as any).ethereum) {
            web3Instance = new Web3((window as any).ethereum);
        } else {
            web3Instance = new Web3(new Web3.providers.HttpProvider(RPC_URL));
        }
    }
    return web3Instance;
}

export async function connectWallet(): Promise<string[]> {
    if (typeof window === "undefined" || !(window as any).ethereum) {
        throw new Error("MetaMask를 설치해주세요.");
    }

    try {
        const accounts = await (window as any).ethereum.request({
            method: "eth_requestAccounts",
        });
        return accounts;
    } catch (error: any) {
        if (error.code === 4001) {
            throw new Error("지갑 연결이 거부되었습니다.");
        }
        throw error;
    }
}

export function onAccountsChanged(callback: (accounts: string[]) => void): () => void {
    if (typeof window === "undefined" || !(window as any).ethereum) {
        return () => { };
    }

    const handler = (accounts: string[]) => {
        callback(accounts);
    };

    (window as any).ethereum.on("accountsChanged", handler);

    return () => {
        (window as any).ethereum.removeListener("accountsChanged", handler);
    };
}

export async function switchNetwork(
    chainId: string,
    chainName: string,
    rpcUrl: string
): Promise<void> {
    if (typeof window === "undefined" || !(window as any).ethereum) {
        throw new Error("MetaMask를 설치해주세요.");
    }

    try {
        await (window as any).ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId }],
        });
    } catch (error: any) {
        if (error.code === 4902) {
            await (window as any).ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                    {
                        chainId,
                        chainName,
                        rpcUrls: [rpcUrl],
                    },
                ],
            });
        } else {
            throw error;
        }
    }
}

export function onChainChanged(callback: (chainId: string) => void): () => void {
    if (typeof window === "undefined" || !(window as any).ethereum) {
        return () => { };
    }

    const handler = (chainId: string) => {
        callback(chainId);
    };

    (window as any).ethereum.on("chainChanged", handler);

    return () => {
        (window as any).ethereum.removeListener("chainChanged", handler);
    };
}

export function hasBrowserWallet(): boolean {
    return typeof window !== "undefined" && !!(window as any).ethereum;
}

export function isExpectedChain(chainId: string): boolean {
    return chainId === CHAIN_ID;
}

export function getExpectedChainLabel(): string {
    return CHAIN_NAME;
}

export async function ensureWalletConnection(): Promise<void> {
    if (!hasBrowserWallet()) {
        throw new Error("MetaMask를 설치해주세요.");
    }

    const accounts = await connectWallet();
    if (accounts.length === 0) {
        throw new Error("지갑 연결에 실패했습니다.");
    }
}

export async function disconnectWallet(): Promise<void> {
    console.log("🔌 disconnectWallet 호출됨");

    // 최신 MetaMask에서 지원하는 wallet_revokePermissions 시도
    if ((window as any).ethereum) {
        try {
            console.log("📡 wallet_revokePermissions 시도...");
            const result = await (window as any).ethereum.request({
                method: 'wallet_revokePermissions',
                params: [{ eth_accounts: {} }]
            });
            console.log("✓ 지갑 연결 권한이 성공적으로 취소되었습니다.", result);
            web3Instance = null;
        } catch (error: any) {
            console.warn("⚠️ wallet_revokePermissions 실패:", error);
            console.log("에러 코드:", error.code);
            console.log("에러 메시지:", error.message);
            // 실패해도 로컬 상태는 정리
            web3Instance = null;
            throw error; // 에러를 상위로 전달하여 폴백 처리 가능하도록
        }
    } else {
        console.warn("⚠️ MetaMask를 찾을 수 없습니다.");
        web3Instance = null;
    }
}

export const CHAIN_ID = process.env.REACT_APP_CHAIN_ID || "0x539";
export const CHAIN_NAME = process.env.REACT_APP_CHAIN_NAME || "Quorum Local";
