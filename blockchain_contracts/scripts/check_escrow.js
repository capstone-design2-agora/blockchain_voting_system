const { ethers } = require("hardhat");

async function main() {
    const escrowAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    const provider = new ethers.JsonRpcProvider("http://localhost:9545");

    // Get deployed bytecode
    const code = await provider.getCode(escrowAddress);
    console.log("Deployed bytecode length:", code.length);
    console.log("First 100 chars:", code.substring(0, 100));

    // Check if it's a valid contract
    if (code === "0x") {
        console.log("❌ No contract deployed at this address!");
    } else {
        console.log("✅ Contract exists");
    }

    // Try to call a view function
    try {
        const escrow = await ethers.getContractAt("SimpleNFTEscrow", escrowAddress);

        // Try to read a deposit (should fail gracefully if doesn't exist)
        try {
            const deposit = await escrow.deposits(1);
            console.log("Deposit 1:", deposit);
        } catch (e) {
            console.log("Cannot read deposit 1:", e.message);
        }
    } catch (e) {
        console.error("Failed to get contract:", e.message);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
