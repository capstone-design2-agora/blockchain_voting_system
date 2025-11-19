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
let cachedWriteContract: Contract<any> | null = null;
let cachedReadContract: Contract<any> | null = null;
let inFlightVote:
  | {
      proposalId: number;
      promise: Promise<TransactionReceipt>;
    }
  | null = null;

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
  mode: "read" | "write" = "write"
): Contract<any> {
  const contractAddress = getConfig().VOTING_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error(
      "스마트 컨트랙트 주소가 설정되지 않았어요. config.json을 확인해 주세요."
    );
  }
  const web3 = getWeb3();
  if (mode === "read") {
    if (!cachedReadContract) {
      cachedReadContract = new web3.eth.Contract(typedAbi, contractAddress);
    }
    return cachedReadContract;
  }
  if (!cachedWriteContract) {
    cachedWriteContract = new web3.eth.Contract(typedAbi, contractAddress);
  }
  return cachedWriteContract;
}

export async function fetchProposals(): Promise<Proposal[]> {
  const contract = assertVotingContract("read");
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

export async function hasVoted(address: string): Promise<boolean> {
  if (!address) {
    return false;
  }
  return assertVotingContract("read").methods.hasVoted(address).call();
}

export function castVote(proposalId: number): Promise<TransactionReceipt> {
  if (inFlightVote && inFlightVote.proposalId === proposalId) {
    return inFlightVote.promise;
  }

  if (inFlightVote) {
    return inFlightVote.promise;
  }

  const trackedPromise = (async () => {
    const contract = assertVotingContract("write");
    const web3 = getWeb3();
    const accounts = await web3.eth.getAccounts();
    const from = accounts[0];

    if (!from) {
      throw new Error("No account available for sending the transaction.");
    }

    const gasPrice = await web3.eth.getGasPrice();
    const receipt = await contract.methods
      .vote(proposalId)
      .send({ from, gasPrice: String(gasPrice) });

    return receipt as TransactionReceipt;
  })();

  inFlightVote = {
    proposalId,
    promise: trackedPromise,
  };

  trackedPromise.finally(() => {
    if (inFlightVote?.promise === trackedPromise) {
      inFlightVote = null;
    }
  });

  return trackedPromise;
}

export async function fetchBallotMetadata(): Promise<ContractBallotMetadata> {
  console.log('[fetchBallotMetadata] Starting...');
  console.log('[fetchBallotMetadata] Contract address:', getConfig().VOTING_CONTRACT_ADDRESS);

  const contract = assertVotingContract("read");
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
