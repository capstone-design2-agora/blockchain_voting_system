const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleNFTEscrow", function () {
  async function deployFixture() {
    const [owner, other, taker] = await ethers.getSigners();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const collectionA = await MockERC721.deploy("MockA", "MKA");
    const collectionB = await MockERC721.deploy("MockB", "MKB");

    const Escrow = await ethers.getContractFactory("SimpleNFTEscrow");
    const escrow = await Escrow.deploy();

    const tokenA = await collectionA.mint(owner.address);
    const tokenB = await collectionB.mint(taker.address);

    return {
      owner,
      other,
      taker,
      collectionA,
      collectionB,
      escrow,
      tokenAId: (await tokenA.wait()).logs[0].args.tokenId,
      tokenBId: (await tokenB.wait()).logs[0].args.tokenId
    };
  }

  it("deposits and withdraws", async function () {
    const { escrow, collectionA, owner, tokenAId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow.connect(owner).deposit(await collectionA.getAddress(), tokenAId);
    const receipt = await depositTx.wait();
    const depositedEvent = receipt.logs.find((l) => l.fragment && l.fragment.name === "Deposited");
    const depositId = depositedEvent.args.depositId;

    const stored = await escrow.deposits(depositId);
    expect(stored.owner).to.equal(owner.address);
    expect(stored.active).to.equal(true);

    await escrow.connect(owner).withdraw(depositId);
    expect((await escrow.deposits(depositId)).active).to.equal(false);
    expect(await collectionA.ownerOf(tokenAId)).to.equal(owner.address);
  });

  it("swaps taker NFT for target deposit", async function () {
    const { escrow, collectionA, collectionB, owner, taker, tokenAId, tokenBId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow.connect(owner).deposit(await collectionA.getAddress(), tokenAId);
    const targetDeposit = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited");
    const targetId = targetDeposit.args.depositId;

    await collectionB.connect(taker).approve(escrow.getAddress(), tokenBId);
    const swapTx = await escrow
      .connect(taker)
      .swap(targetId, await collectionB.getAddress(), tokenBId);

    const swapReceipt = await swapTx.wait();
    const swapEvent = swapReceipt.logs.find((l) => l.fragment && l.fragment.name === "Swapped");
    expect(swapEvent.args.targetDepositId).to.equal(targetId);

    // Ownership flipped
    expect(await collectionA.ownerOf(tokenAId)).to.equal(taker.address);
    expect(await collectionB.ownerOf(tokenBId)).to.equal(owner.address);

    const targetDeposit = await escrow.deposits(targetId);
    expect(targetDeposit.active).to.equal(false);
  });

  it("reverts withdraw from non-owner", async function () {
    const { escrow, collectionA, owner, other, tokenAId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow.connect(owner).deposit(await collectionA.getAddress(), tokenAId);
    const depositId = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited").args.depositId;

    await expect(escrow.connect(other).withdraw(depositId)).to.be.revertedWithCustomError(
      escrow,
      "NotOwner"
    );
  });

  it("reverts swap on inactive target", async function () {
    const { escrow, collectionA, collectionB, owner, taker, tokenAId, tokenBId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow.connect(owner).deposit(await collectionA.getAddress(), tokenAId);
    const targetId = (await depositTx.wait()).logs[0].args.depositId;
    await escrow.connect(owner).withdraw(targetId);

    await collectionB.connect(taker).approve(escrow.getAddress(), tokenBId);
    await expect(
      escrow.connect(taker).swap(targetId, await collectionB.getAddress(), tokenBId)
    ).to.be.revertedWithCustomError(escrow, "InactiveDeposit");
  });
});
