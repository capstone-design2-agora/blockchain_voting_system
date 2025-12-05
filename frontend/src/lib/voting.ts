import type { Contract } from "web3";
import type { TransactionReceipt } from "web3-types";
import type { AbiItem } from "web3-utils";
import { getWeb3 } from "./web3";
import { getConfig } from "./config";
import VotingWithSBTAbi from "../abi/VotingWithSBT.abi.json";

export type Proposal = {
  id: number;
  name: string;
  voteCount: number;
  pledges?: string[];
};

// Removed top-level constants to force usage of getConfig()
// const contractAddress = ...
// const expectedVoters = ...

const typedAbi = VotingWithSBTAbi as AbiItem[];
const cachedWriteContracts = new Map<string, Contract<any>>();
const cachedReadContracts = new Map<string, Contract<any>>();

export type ContractBallotMetadata = {
  id: string;
  title: string;
  description: string;
  opensAt: number;
  closesAt: number;
  announcesAt: number;
  expectedVoters: number | null;
};

function assertVotingContract(
  contractAddress: string,
  mode: "read" | "write" = "write"
): Contract<any> {
  if (!contractAddress) {
    throw new Error("Contract address is required");
  }
  const web3 = getWeb3();
  if (mode === "read") {
    if (!cachedReadContracts.has(contractAddress)) {
      cachedReadContracts.set(
        contractAddress,
        new web3.eth.Contract(typedAbi, contractAddress)
      );
    }
    return cachedReadContracts.get(contractAddress)!;
  }
  if (!cachedWriteContracts.has(contractAddress)) {
    cachedWriteContracts.set(
      contractAddress,
      new web3.eth.Contract(typedAbi, contractAddress)
    );
  }
  return cachedWriteContracts.get(contractAddress)!;
}

export async function fetchProposals(contractAddress: string): Promise<Proposal[]> {
  const contract = assertVotingContract(contractAddress, "read");
  const total = Number.parseInt(
    await contract.methods.proposalCount().call(),
    10
  );

  const proposals: Proposal[] = [];
  for (let id = 0; id < total; id += 1) {
    // Fetch basic info and pledges separately to avoid struct array issues
    const basicInfo = await contract.methods.getProposalBasic(id).call() as any;
    const pledges = await contract.methods.getProposalPledges(id).call() as string[];

    console.log(`[fetchProposals] Proposal ${id}:`, {
      name: basicInfo[0] || basicInfo.name,
      voteCount: basicInfo[1] || basicInfo.voteCount,
      pledges
    });

    proposals.push({
      id,
      name: basicInfo[0] || basicInfo.name || '',
      voteCount: Number.parseInt(basicInfo[1] || basicInfo.voteCount || "0", 10) || 0,
      pledges: Array.isArray(pledges) ? pledges : [],
    });
  }
  console.log('[fetchProposals] All proposals:', proposals);
  return proposals;
}

export async function hasVoted(contractAddress: string, address: string): Promise<boolean> {
  if (!address) {
    return false;
  }
  return assertVotingContract(contractAddress, "read").methods.hasVoted(address).call();
}

export async function castVote(
  contractAddress: string,
  proposalId: number,
  fromOverride?: string
): Promise<TransactionReceipt> {
  // Send a fresh transaction every time; do not cache in-flight promises
  const contract = assertVotingContract(contractAddress, "write");
  const web3 = getWeb3();
  const accounts = fromOverride ? [fromOverride] : await web3.eth.getAccounts();
  const from = fromOverride || accounts[0];

  if (!from) {
    throw new Error("No account available for sending the transaction.");
  }

  // Preflight to surface revert reasons before sending a real transaction
  try {
    await contract.methods.vote(proposalId).call({ from });
  } catch (preflightError: any) {
    throw new Error(preflightError?.message || "Vote preflight failed");
  }

  // Add a buffered gas limit to avoid OOG when the node underestimates storage writes
  let gasLimit = 350000; // reasonable fallback for mint + storage writes
  try {
    const estimate = await contract.methods.vote(proposalId).estimateGas({ from });
    const buffered = Math.floor(Number(estimate) * 1.3);
    if (Number.isFinite(buffered) && buffered > gasLimit) {
      gasLimit = buffered;
    }
  } catch (estimateError) {
    console.warn("Gas estimation failed, using fallback limit", estimateError);
  }

  const gasPrice = await web3.eth.getGasPrice();
  const receipt = await contract.methods
    .vote(proposalId)
    .send({ from, gas: String(gasLimit), gasPrice: String(gasPrice) });

  return receipt as TransactionReceipt;
}

export async function fetchBallotMetadata(contractAddress: string): Promise<ContractBallotMetadata> {
  console.log('[fetchBallotMetadata] Starting...');
  console.log('[fetchBallotMetadata] Contract address:', contractAddress);

  const contract = assertVotingContract(contractAddress, "read");
  console.log('[fetchBallotMetadata] Contract instance created');

  const raw = (await contract.methods.ballotMetadata().call()) as {
    id?: string;
    title?: string;
    description?: string;
    opensAt?: string;
    closesAt?: string;
    announcesAt?: string;
    expectedVoters?: string;
    [key: string]: any;
  };

  console.log('[fetchBallotMetadata] Raw response:', raw);
  console.log('[fetchBallotMetadata] Raw response type:', typeof raw);
  console.log('[fetchBallotMetadata] Raw[3] (opensAt):', raw[3], typeof raw[3]);

  const structIndexMap: Record<string, number> = {
    id: 0,
    title: 1,
    description: 2,
    opensAt: 3,
    closesAt: 4,
    announcesAt: 5,
    expectedVoters: 6,
  };

  const getString = (key: string, fallback = "") => {
    if (typeof raw[key] === "string" && raw[key].length > 0) {
      return raw[key] as string;
    }
    const index = structIndexMap[key];
    if (typeof index === "number") {
      const value = raw[index];
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
    return fallback;
  };

  const getUint = (key: string): number => {
    let value: unknown = raw[key];
    if (value === undefined) {
      const index = structIndexMap[key];
      if (typeof index === "number") {
        value = raw[index];
      }
    }

    console.log(`[getUint] key="${key}", value=`, value, `type=${typeof value}`);

    // For timestamp fields, handle large nanosecond values
    const isTimestamp = key.endsWith('At');

    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "bigint") {
      // For nanosecond timestamps, convert to milliseconds first
      if (isTimestamp && value > BigInt(1e15)) {
        // It's in nanoseconds, convert to milliseconds for JavaScript Date
        const milliseconds = Number(value / BigInt(1_000_000));
        console.log(`[getUint] Converted nanoseconds ${value} to ${milliseconds}ms`);
        return milliseconds;
      }
      return Number(value);
    }
    if (typeof value === "string" && value) {
      // Try to parse as BigInt first for large numbers
      try {
        const bigIntValue = BigInt(value);
        // Same nanosecond handling for strings
        if (isTimestamp && bigIntValue > BigInt(1e15)) {
          const milliseconds = Number(bigIntValue / BigInt(1_000_000));
          console.log(`[getUint] Converted string nanoseconds ${value} to ${milliseconds}ms`);
          return milliseconds;
        }
        return Number(bigIntValue);
      } catch {
        const numeric = Number.parseInt(value, 10);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }
    }
    return 0;
  };

  const expected = getUint("expectedVoters");

  const result = {
    id: getString("id"),
    title: getString("title"),
    description: getString("description"),
    opensAt: getUint("opensAt"),
    closesAt: getUint("closesAt"),
    announcesAt: getUint("announcesAt"),
    expectedVoters: expected > 0 ? expected : null,
  };

  console.log('[fetchBallotMetadata] Result:', result);
  return result;
}

export function calculateTurnout(
  totalVotes: number,
  overrideExpected?: number | null
): number {
  const baseline =
    overrideExpected && overrideExpected > 0 ? overrideExpected : getConfig().EXPECTED_VOTERS;
  if (!baseline || baseline <= 0) {
    return totalVotes > 0 ? 100 : 0;
  }
  return Math.min(100, (totalVotes / baseline) * 100);
}

export function getExpectedVoters(): number | null {
  return getConfig().EXPECTED_VOTERS;
}
