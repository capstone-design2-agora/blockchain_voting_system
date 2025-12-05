const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleNFTEscrow", function () {
  const BALLOT_ID = "ballot-1";
  const GRADE = 2;
  const OTHER_GRADE = 0;

  async function getTokenId(tx) {
    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find((l) => l.fragment && l.fragment.name === "Transfer");
    return transferEvent.args.tokenId;
  }

  async function deployFixture() {
    const [owner, other, taker] = await ethers.getSigners();

    const MockERC721 = await ethers.getContractFactory("MockERC721");
    const collectionA = await MockERC721.deploy("MockA", "MKA");
    const collectionB = await MockERC721.deploy("MockB", "MKB");

    const Escrow = await ethers.getContractFactory("SimpleNFTEscrow");
    const escrow = await Escrow.deploy();

    const tokenAId = await getTokenId(await collectionA.mintWithMeta(owner.address, BALLOT_ID, GRADE));
    const tokenBId = await getTokenId(await collectionB.mintWithMeta(taker.address, BALLOT_ID, GRADE));
    const wrongGradeId = await getTokenId(
      await collectionB.mintWithMeta(taker.address, BALLOT_ID, OTHER_GRADE)
    );

    return {
      owner,
      other,
      taker,
      collectionA,
      collectionB,
      escrow,
      tokenAId,
      tokenBId,
      wrongGradeId,
    };
  }

  it("deposits and withdraws with criteria stored", async function () {
    const { escrow, collectionA, owner, tokenAId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, BALLOT_ID, GRADE);
    const receipt = await depositTx.wait();
    const depositedEvent = receipt.logs.find((l) => l.fragment && l.fragment.name === "Deposited");
    const depositId = depositedEvent.args.depositId;

    const stored = await escrow.deposits(depositId);
    expect(stored.owner).to.equal(owner.address);
    expect(stored.active).to.equal(true);
    expect(stored.requiredBallotId).to.equal(BALLOT_ID);
    expect(stored.requiredGrade).to.equal(GRADE);

    await escrow.connect(owner).withdraw(depositId);
    expect((await escrow.deposits(depositId)).active).to.equal(false);
    expect(await collectionA.ownerOf(tokenAId)).to.equal(owner.address);
  });

  it("swaps taker NFT when ballot/grade match", async function () {
    const { escrow, collectionA, collectionB, owner, taker, tokenAId, tokenBId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, BALLOT_ID, GRADE);
    const targetDepositEvent = (await depositTx.wait()).logs.find(
      (l) => l.fragment && l.fragment.name === "Deposited"
    );
    const targetId = targetDepositEvent.args.depositId;

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

    const storedTarget = await escrow.deposits(targetId);
    expect(storedTarget.active).to.equal(false);
  });

  it("allows empty ballot criteria and checks only grade", async function () {
    const { escrow, collectionA, collectionB, owner, taker } = await deployFixture();
    const tokenAId = await getTokenId(await collectionA.mintWithMeta(owner.address, "", GRADE));
    const tokenBId = await getTokenId(await collectionB.mintWithMeta(taker.address, "any", GRADE));

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, "", GRADE);
    const targetId = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited").args
      .depositId;

    await collectionB.connect(taker).approve(escrow.getAddress(), tokenBId);
    await expect(
      escrow.connect(taker).swap(targetId, await collectionB.getAddress(), tokenBId)
    ).to.not.be.reverted;
  });

  it("reverts withdraw from non-owner", async function () {
    const { escrow, collectionA, owner, other, tokenAId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, BALLOT_ID, GRADE);
    const depositId = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited").args
      .depositId;

    await expect(escrow.connect(other).withdraw(depositId)).to.be.revertedWithCustomError(
      escrow,
      "NotOwner"
    );
  });

  it("reverts swap on inactive target", async function () {
    const { escrow, collectionA, collectionB, owner, taker, tokenAId, tokenBId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, BALLOT_ID, GRADE);
    const targetId = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited").args
      .depositId;
    await escrow.connect(owner).withdraw(targetId);

    await collectionB.connect(taker).approve(escrow.getAddress(), tokenBId);
    await expect(
      escrow.connect(taker).swap(targetId, await collectionB.getAddress(), tokenBId)
    ).to.be.revertedWithCustomError(escrow, "InactiveDeposit");
  });

  it("reverts swap when grade mismatch", async function () {
    const { escrow, collectionA, collectionB, owner, taker, tokenAId, wrongGradeId } = await deployFixture();

    await collectionA.connect(owner).approve(escrow.getAddress(), tokenAId);
    const depositTx = await escrow
      .connect(owner)
      .deposit(await collectionA.getAddress(), tokenAId, BALLOT_ID, GRADE);
    const targetId = (await depositTx.wait()).logs.find((l) => l.fragment && l.fragment.name === "Deposited").args
      .depositId;

    await collectionB.connect(taker).approve(escrow.getAddress(), wrongGradeId);
    await expect(
      escrow.connect(taker).swap(targetId, await collectionB.getAddress(), wrongGradeId)
    ).to.be.revertedWithCustomError(escrow, "CriteriaNotMet");
  });
});
