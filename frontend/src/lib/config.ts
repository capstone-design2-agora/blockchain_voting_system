export interface AppConfig {
  CITIZEN_SBT_ADDRESS: string;
  VOTING_CONTRACT_ADDRESS: string;
  REWARD_NFT_ADDRESS: string;
  SIMPLE_ESCROW_ADDRESS: string;
  VERIFIER_ADDRESS: string;
  RPC_URL: string;
  CHAIN_ID: string;
  CHAIN_NAME: string;
  EXPECTED_VOTERS: number;
}

let config: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (config) return config;
  try {
    const response = await fetch("/config.json");
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.statusText}`);
    }
    config = await response.json();
    return config!;
  } catch (error) {
    console.error("Failed to load config.json", error);
    throw error;
  }
}

export function getConfig(): AppConfig {
  if (!config) {
    throw new Error("Config not loaded. Make sure to call loadConfig() before using getConfig().");
  }
  return config;
}
