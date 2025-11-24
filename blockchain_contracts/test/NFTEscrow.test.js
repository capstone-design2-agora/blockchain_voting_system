const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, bob, carol] = await ethers.getSigners();

  const MockERC721 = await ethers.getContractFactory("MockERC721");
  const nft = await MockERC721.deploy();
  await nft.waitForDeployment();

  const NFTEscrow = await ethers.getContractFactory("NFTEscrow");
  const escrow = await NFTEscrow.deploy();
  await escrow.waitForDeployment();

  await nft.mintWithId(owner.address, 1);
  await nft.mintWithId(bob.address, 2);
  await nft.mintWithId(carol.address, 3);

  return { owner, bob, carol, nft, escrow };
}

async function depositsFixture() {
  const context = await loadFixture(deployFixture);
  const { owner, bob, nft, escrow } = context;
  const escrowAddress = await escrow.getAddress();

  await nft.connect(owner).approve(escrowAddress, 1);
  await nft.connect(bob).approve(escrowAddress, 2);

  await escrow.connect(owner).deposit(await nft.getAddress(), 1);
  await escrow.connect(bob).deposit(await nft.getAddress(), 2);

  return context;
}

describe("NFTEscrow", () => {
  it("accepts ERC721 transfers via onERC721Received", async () => {
    const { escrow } = await loadFixture(deployFixture);
    const selector = await escrow.onERC721Received(ethers.ZeroAddress, ethers.ZeroAddress, 1, "0x");
    expect(selector).to.equal("0x150b7a02");
  });

  it("stores deposits and holds NFTs", async () => {
    const { owner, nft, escrow } = await loadFixture(deployFixture);
    const escrowAddress = await escrow.getAddress();

    await nft.connect(owner).approve(escrowAddress, 1);
    const tx = await escrow.connect(owner).deposit(await nft.getAddress(), 1);
    await tx.wait();

    const deposit = await escrow.deposits(1);
    expect(deposit.owner).to.equal(owner.address);
    expect(deposit.nft).to.equal(await nft.getAddress());
    expect(deposit.tokenId).to.equal(1n);
    expect(deposit.active).to.equal(true);
    expect(await nft.ownerOf(1)).to.equal(escrowAddress);
    expect(await escrow.nextDepositId()).to.equal(2n);
  });

  it("withdraws an active deposit", async () => {
    const { owner, nft, escrow } = await loadFixture(depositsFixture);
    const escrowAddress = await escrow.getAddress();

    await expect(escrow.connect(owner).withdraw(1))
      .to.emit(escrow, "Withdrawn")
      .withArgs(1, owner.address);

    expect(await nft.ownerOf(1)).to.equal(owner.address);
    const deposit = await escrow.deposits(1);
    expect(deposit.active).to.equal(false);
    expect(deposit.owner).to.equal(owner.address);

    await expect(escrow.connect(owner).withdraw(1)).to.be.revertedWithCustomError(escrow, "InactiveDeposit");
    expect(await nft.ownerOf(1)).to.equal(owner.address);
    expect(await escrow.nextDepositId()).to.equal(3n);
    expect(await nft.ownerOf(2)).to.equal(escrowAddress);
  });

  it("reverts withdraw if caller is not owner", async () => {
    const { bob, escrow } = await loadFixture(depositsFixture);
    await expect(escrow.connect(bob).withdraw(1)).to.be.revertedWithCustomError(escrow, "NotOwner");
  });

  it("swaps two active deposits and updates owners", async () => {
    const { owner, bob, nft, escrow } = await loadFixture(depositsFixture);

    await expect(escrow.connect(owner).swap(1, 2))
      .to.emit(escrow, "Swapped")
      .withArgs(1, 2, owner.address, bob.address);

    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.ownerOf(2)).to.equal(owner.address);

    const deposit1 = await escrow.deposits(1);
    const deposit2 = await escrow.deposits(2);
    expect(deposit1.owner).to.equal(bob.address);
    expect(deposit2.owner).to.equal(owner.address);
    expect(deposit1.active).to.equal(true);
    expect(deposit2.active).to.equal(true);
  });

  it("rejects swap when deposit inactive", async () => {
    const { owner, escrow } = await loadFixture(depositsFixture);
    await escrow.connect(owner).withdraw(1);
    await expect(escrow.connect(owner).swap(1, 2)).to.be.revertedWithCustomError(escrow, "InactiveDeposit");
  });

  it("rejects swap when caller does not own source deposit", async () => {
    const { bob, escrow } = await loadFixture(depositsFixture);
    await expect(escrow.connect(bob).swap(1, 2)).to.be.revertedWithCustomError(escrow, "NotOwner");
  });

  it("rejects self swap", async () => {
    const { owner, escrow } = await loadFixture(depositsFixture);
    await expect(escrow.connect(owner).swap(1, 1)).to.be.revertedWithCustomError(escrow, "SelfSwap");
  });
});
