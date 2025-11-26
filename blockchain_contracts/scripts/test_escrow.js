const { ethers } = require("hardhat");

async function main() {
    const escrowAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const rewardNftAddress = "0x958682C361a399DDB242dCF44732fbB52574F336";

    console.log("🔍 Testing Escrow Contract...");
    console.log("Escrow Address:", escrowAddress);
    console.log("Reward NFT Address:", rewardNftAddress);

    // Get the contract
    const escrow = await ethers.getContractAt("SimpleNFTEscrow", escrowAddress);
    const rewardNft = await ethers.getContractAt("VotingRewardNFT", rewardNftAddress);

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);

    // Check if signer has any NFTs
    const balance = await rewardNft.balanceOf(signer.address);
    console.log("NFT Balance:", balance.toString());

        if (balance > 0) {
            // Get first token
            const tokenId = await rewardNft.tokenOfOwnerByIndex(signer.address, 0);
            console.log("First Token ID:", tokenId.toString());

            const ballotId = await rewardNft.getBallotId(tokenId);
            const rarity = await rewardNft.getRarity(tokenId);
            console.log("Ballot ID:", ballotId);
            console.log("Rarity (grade):", rarity.toString());

            // Check owner
            const owner = await rewardNft.ownerOf(tokenId);
            console.log("Token Owner:", owner);

        // Check approval
        const isApproved = await rewardNft.isApprovedForAll(signer.address, escrowAddress);
        console.log("Is Approved:", isApproved);

        if (!isApproved) {
            console.log("Setting approval...");
            const tx = await rewardNft.setApprovalForAll(escrowAddress, true);
            await tx.wait();
            console.log("✅ Approval set");
        }

            // Try to deposit
            console.log("Attempting deposit...");
            try {
                const tx = await escrow.deposit(rewardNftAddress, tokenId, ballotId, rarity);
                console.log("Transaction sent:", tx.hash);
                const receipt = await tx.wait();
                console.log("Transaction confirmed");
                console.log("Gas used:", receipt.gasUsed.toString());
                console.log("Logs:", receipt.logs.length);

            // Parse logs
            for (const log of receipt.logs) {
                try {
                    const parsed = escrow.interface.parseLog(log);
                    console.log("Event:", parsed.name, parsed.args);
                } catch (e) {
                    // Ignore
                }
            }
        } catch (error) {
            console.error("❌ Deposit failed:", error.message);
            if (error.data) {
                console.error("Error data:", error.data);
            }
        }
    }

    // Check next deposit ID
    try {
        const nextId = await escrow._nextId();
        console.log("Next Deposit ID:", nextId.toString());
    } catch (e) {
        console.log("Cannot read _nextId (private variable)");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
