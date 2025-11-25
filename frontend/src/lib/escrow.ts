import { ethers } from "ethers";
import escrowAbi from "../abi/SimpleNFTEscrow.json";
import { getConfig } from "./config";

function getSigner() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    throw new Error("MetaMask (window.ethereum) not found");
  }
  const provider = new ethers.BrowserProvider(ethereum);
  return provider.getSigner();
}

function getEscrowContract(signerOrProvider: ethers.Provider | ethers.Signer) {
  const { SIMPLE_ESCROW_ADDRESS } = getConfig();
  return new ethers.Contract(SIMPLE_ESCROW_ADDRESS, escrowAbi.abi, signerOrProvider);
}

export async function depositToEscrow(nftAddress: string, tokenId: string | number | bigint) {
  console.log("🎬 depositToEscrow called with:", { nftAddress, tokenId });
  
  const signer = await getSigner();
  const contract = getEscrowContract(signer);
  
  console.log("📍 Escrow contract address:", contract.target);
  console.log("📍 NFT address:", nftAddress);
  console.log("🎫 Token ID:", tokenId.toString());
  
  let depositId: bigint | null = null;

  // Method 1: Use staticCall to get the return value before sending the transaction
  console.log("🔍 Attempting staticCall...");
  try {
    depositId = await contract.deposit.staticCall(nftAddress, tokenId);
    console.log("✅ Got depositId from staticCall:", depositId?.toString());
  } catch (error: any) {
    console.error("❌ staticCall failed:", error);
    console.error("Error message:", error?.message);
    console.error("Error reason:", error?.reason);
    console.error("Error code:", error?.code);
    // Don't throw, continue to try the actual transaction
  }

  // Send the actual transaction
  console.log("📤 Sending deposit transaction...");
  const tx = await contract.deposit(nftAddress, tokenId);
  console.log("📤 Transaction sent:", tx.hash);
  console.log("📋 Transaction data:", tx.data);
  
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
  console.log("📊 Gas used:", receipt.gasUsed.toString());
  console.log("📊 Status:", receipt.status);
  console.log("📊 Logs count:", receipt.logs.length);

  // Method 2: Parse receipt logs directly
  if (!depositId) {
    const targetAddress = String(contract.target).toLowerCase();
    console.log("🔍 Parsing logs for Deposited event...");
    console.log("🎯 Target contract address:", targetAddress);
    
    for (const log of receipt.logs) {
      console.log("📋 Log address:", log.address);
      if (String(log.address).toLowerCase() !== targetAddress) {
        console.log("⏭️ Skipping log from different address");
        continue;
      }
      try {
        const parsed = contract.interface.parseLog(log);
        console.log("📋 Found event:", parsed?.name);
        if (parsed?.name === "Deposited") {
          depositId = parsed.args.depositId as bigint;
          console.log("✅ Got depositId from event logs:", depositId?.toString());
          break;
        }
      } catch (err) {
        console.warn("⚠️ Failed to parse log:", err);
      }
    }
  }

  // Method 3: Query the block for the Deposited event
  if (!depositId) {
    console.log("🔍 Querying block for Deposited event...");
    try {
      const events = await contract.queryFilter(
        contract.filters.Deposited(),
        receipt.blockNumber,
        receipt.blockNumber
      );
      console.log("📋 Found events:", events.length);
      
      for (const event of events) {
        console.log("📋 Event tx hash:", (event as any).transactionHash);
        console.log("📋 Our tx hash:", tx.hash);
      }
      
      const matched = events.find((e) => (e as any).transactionHash === tx.hash);
      if (matched) {
        console.log("✅ Found matching event:", matched);
        const id = (matched as any)?.args?.depositId;
        if (id !== undefined && id !== null) {
          depositId = BigInt(id);
          console.log("✅ Got depositId from queryFilter:", depositId?.toString());
        }
      }
    } catch (error) {
      console.error("❌ queryFilter failed:", error);
    }
  }

  if (!depositId) {
    console.error("❌ Failed to get depositId from all methods");
    console.error("Receipt:", receipt);
    console.error("Logs:", receipt.logs);
  }

  return { tx, receipt, depositId };
}

export async function swapOnEscrow(targetDepositId: string | number | bigint, nftAddress: string, tokenId: string | number | bigint) {
  const signer = await getSigner();
  const contract = getEscrowContract(signer);
  return contract.swap(targetDepositId, nftAddress, tokenId);
}

export async function withdrawFromEscrow(depositId: string | number | bigint) {
  const signer = await getSigner();
  const contract = getEscrowContract(signer);
  return contract.withdraw(depositId);
}

export async function getDeposit(depositId: string | number | bigint) {
  const signer = await getSigner();
  const contract = getEscrowContract(signer);
  return contract.deposits(depositId);
}
