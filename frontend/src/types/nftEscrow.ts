export type EscrowStatus = "ACTIVE" | "WITHDRAWN";

export interface EscrowDeposit {
  id: number;
  owner_wallet: string;
  nft_contract: string;
  token_id: string;
  status: EscrowStatus;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscrowDepositsResponse {
  deposits: EscrowDeposit[];
}
