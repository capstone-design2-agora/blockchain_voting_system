import Web3 from "web3";
import { getWeb3 } from "./web3";
import CitizenSBTAbi from "../abi/CitizenSBT.abi.json";
import VotingWithSBTAbi from "../abi/VotingWithSBT.abi.json";
import VotingRewardNFTAbi from "../abi/VotingRewardNFT.abi.json";

const CITIZEN_SBT_ADDRESS = process.env.REACT_APP_CITIZEN_SBT_ADDRESS;
const VOTING_CONTRACT_ADDRESS = process.env.REACT_APP_VOTING_CONTRACT_ADDRESS;
const REWARD_NFT_ADDRESS = process.env.REACT_APP_REWARD_NFT_ADDRESS;
const VERIFIER_ADDRESS = process.env.REACT_APP_VERIFIER_ADDRESS;

if (!CITIZEN_SBT_ADDRESS) {
    throw new Error("REACT_APP_CITIZEN_SBT_ADDRESS is not set in environment");
}
if (!VOTING_CONTRACT_ADDRESS) {
    throw new Error("REACT_APP_VOTING_CONTRACT_ADDRESS is not set in environment");
}
if (!REWARD_NFT_ADDRESS) {
    throw new Error("REACT_APP_REWARD_NFT_ADDRESS is not set in environment");
}
if (!VERIFIER_ADDRESS) {
    throw new Error("REACT_APP_VERIFIER_ADDRESS is not set in environment");
}

/**
 * Generate identity hash from name and birth date
 */
export function generateIdentityHash(name: string, birthDate: string): string {
    const web3 = getWeb3();
    const data = `${name.toLowerCase()}-${birthDate}`;
    return web3.utils.keccak256(data);
}

/**
 * Get CitizenSBT contract instance
 */
export function getCitizenSBTContract(web3?: Web3) {
    const w3 = web3 || getWeb3();
    return new w3.eth.Contract(CitizenSBTAbi as any, CITIZEN_SBT_ADDRESS);
}

/**
 * Get VotingWithSBT contract instance
 */
export function getVotingContract(web3?: Web3) {
    const w3 = web3 || getWeb3();
    return new w3.eth.Contract(VotingWithSBTAbi as any, VOTING_CONTRACT_ADDRESS);
}

/**
 * Get VotingRewardNFT contract instance
 */
export function getRewardNFTContract(web3?: Web3) {
    const w3 = web3 || getWeb3();
    return new w3.eth.Contract(VotingRewardNFTAbi as any, REWARD_NFT_ADDRESS);
}

/**
 * Check if wallet has SBT
 */
export async function checkHasSBT(walletAddress: string): Promise<boolean> {
    try {
        const contract = getCitizenSBTContract();
        const hasSBT = await contract.methods.hasSBT(walletAddress).call();
        return Boolean(hasSBT);
    } catch (error) {
        console.error("Error checking SBT:", error);
        throw new Error("SBT 확인 중 오류가 발생했습니다.");
    }
}

/**
 * Check if identity hash is already registered
 */
export async function checkIdentityRegistered(identityHash: string): Promise<boolean> {
    try {
        const contract = getCitizenSBTContract();
        const isRegistered = await contract.methods.isIdentityRegistered(identityHash).call();
        return Boolean(isRegistered);
    } catch (error) {
        console.error("Error checking identity registration:", error);
        throw new Error("신원 확인 중 오류가 발생했습니다.");
    }
}

/**
 * Get wallet address by identity hash
 */
export async function getWalletByIdentity(identityHash: string): Promise<string> {
    try {
        const contract = getCitizenSBTContract();
        const wallet = await contract.methods.getWalletByIdentity(identityHash).call();
        return String(wallet);
    } catch (error) {
        console.error("Error getting wallet by identity:", error);
        throw new Error("지갑 주소 조회 중 오류가 발생했습니다.");
    }
}

/**
 * Mint SBT to wallet (user mints to themselves - testing only)
 */
export async function mintSBT(toAddress: string, identityHash: string): Promise<string> {
    try {
        const web3 = getWeb3();
        const contract = getCitizenSBTContract(web3);

        console.log('Minting SBT...');
        console.log('  To:', toAddress);
        console.log('  Identity Hash:', identityHash);

        const gasEstimate = await contract.methods
            .mint(toAddress, identityHash)
            .estimateGas({ from: toAddress })
            .catch(() => 500000);

        const gasPrice = await web3.eth.getGasPrice();

        const receipt = await contract.methods
            .mint(toAddress, identityHash)
            .send({
                from: toAddress,
                gas: String(typeof gasEstimate === 'number' ? Math.floor(gasEstimate * 1.2) : gasEstimate),
                gasPrice: String(gasPrice),
            });

        console.log('  ✓ SBT minted! TX:', receipt.transactionHash);
        return receipt.transactionHash as string;
    } catch (error: any) {
        console.error("Error minting SBT:", error);

        if (error.message?.includes("WalletAlreadyHasSBT")) {
            throw new Error("이 지갑은 이미 SBT를 보유하고 있습니다.");
        }
        if (error.message?.includes("IdentityAlreadyRegistered")) {
            throw new Error("이 신원은 이미 등록되어 있습니다.");
        }

        throw new Error(error.message || "SBT 발급 중 오류가 발생했습니다.");
    }
}

/**
 * Vote on proposal (requires SBT)
 */
export async function voteWithSBT(
    proposalId: number,
    fromAddress: string
): Promise<{ transactionHash: string; rewardTokenId: string }> {
    try {
        const web3 = getWeb3();
        const contract = getVotingContract(web3);

        const gasEstimate = await contract.methods.vote(proposalId).estimateGas({ from: fromAddress });
        const gasPrice = await web3.eth.getGasPrice();

        const receipt = await contract.methods
            .vote(proposalId)
            .send({
                from: fromAddress,
                gas: String(Math.floor(Number(gasEstimate) * 1.2)),
                gasPrice: String(gasPrice),
            });

        const events = receipt.events;
        let rewardTokenId = "0";

        if (events?.RewardMinted) {
            rewardTokenId = String((events.RewardMinted.returnValues as any).tokenId);
        }

        return {
            transactionHash: receipt.transactionHash as string,
            rewardTokenId: rewardTokenId,
        };
    } catch (error: any) {
        console.error("Error voting with SBT:", error);

        if (error.message?.includes("VoterNotVerified")) {
            throw new Error("투표 권한이 없습니다. SBT를 먼저 발급받아야 합니다.");
        }
        if (error.message?.includes("AlreadyVoted")) {
            throw new Error("이미 투표하셨습니다.");
        }
        if (error.message?.includes("VotingNotOpen")) {
            throw new Error("투표가 시작되지 않았습니다.");
        }
        if (error.message?.includes("VotingClosed")) {
            throw new Error("투표가 종료되었습니다.");
        }

        throw new Error("투표 중 오류가 발생했습니다.");
    }
}

/**
 * Get reward NFTs owned by address with metadata
 */
export async function getRewardNFTs(
    address: string
): Promise<Array<{ tokenId: string; ballotId: string; proposalId: string; imageUrl: string; metadata: any }>> {
    try {
        const contract = getRewardNFTContract();
        const tokenIds = await contract.methods.tokensOfOwner(address).call();

        if (!tokenIds || (tokenIds as any[]).length === 0) {
            return [];
        }

        const nfts = await Promise.all(
            (tokenIds as string[]).map(async (tokenId) => {
                const ballotId = await contract.methods.getBallotId(tokenId).call();
                const voteRecord = await contract.methods.getVoteRecord(tokenId).call();

                // Get tokenURI (base URL without tokenId)
                let imageUrl = "";
                let metadata = null;

                try {
                    const tokenURI = await contract.methods.tokenURI(tokenId).call();

                    // tokenURI returns base_url/tokenId format (e.g., ipfs://QmXyz.../0)
                    // We need to remove the /tokenId part and use the base image
                    let uri = String(tokenURI);

                    // Remove the trailing /tokenId (e.g., /0, /1, /2)
                    const lastSlashIndex = uri.lastIndexOf('/');
                    if (lastSlashIndex !== -1 && /^\d+$/.test(uri.substring(lastSlashIndex + 1))) {
                        uri = uri.substring(0, lastSlashIndex);
                    }

                    // Convert ipfs:// to https gateway
                    imageUrl = uri.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/');

                    console.log(`Token ${tokenId} image URL:`, imageUrl);
                } catch (uriError) {
                    console.warn(`Failed to get tokenURI for token ${tokenId}:`, uriError);
                    imageUrl = "";
                } return {
                    tokenId: tokenId,
                    ballotId: String(ballotId),
                    proposalId: (voteRecord as any).proposalId.toString(),
                    imageUrl: imageUrl,
                    metadata: metadata,
                };
            })
        );

        return nfts;
    } catch (error) {
        console.error("Error getting reward NFTs:", error);
        throw new Error("보상 NFT 조회 중 오류가 발생했습니다.");
    }
}

export const VERIFIER_ADDR = VERIFIER_ADDRESS;
export const CITIZEN_SBT_ADDR = CITIZEN_SBT_ADDRESS;
export const VOTING_CONTRACT_ADDR = VOTING_CONTRACT_ADDRESS;
export const REWARD_NFT_ADDR = REWARD_NFT_ADDRESS;
