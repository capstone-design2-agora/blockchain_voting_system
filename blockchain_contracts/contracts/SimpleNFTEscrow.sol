// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SimpleNFTEscrow
/// @notice Minimal ERC-721 escrow where anyone can swap an active deposit by escrowing their own NFT.
///         No approvals or TTLs. Depositor may withdraw while active. Swaps are 1:1 and atomic.
contract SimpleNFTEscrow is IERC721Receiver, ReentrancyGuard {
    struct Deposit {
        address owner;
        address nft;
        uint256 tokenId;
        bool active;
    }

    uint256 private _nextId = 1;
    mapping(uint256 => Deposit) public deposits;

    event Deposited(uint256 indexed depositId, address indexed owner, address indexed nft, uint256 tokenId);
    event Withdrawn(uint256 indexed depositId, address indexed owner);
    event Swapped(
        uint256 indexed targetDepositId,
        uint256 indexed takerDepositId,
        address indexed taker,
        address targetOwner,
        address takerNft,
        uint256 takerTokenId
    );

    error NotOwner();
    error InactiveDeposit();
    error InvalidNFT();
    error ZeroAddress();

    /// @notice Deposit an ERC-721 into escrow. Returns the new depositId.
    function deposit(address nft, uint256 tokenId) external nonReentrant returns (uint256 depositId) {
        _validateNFT(nft);
        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);

        depositId = _nextId++;
        deposits[depositId] = Deposit({owner: msg.sender, nft: nft, tokenId: tokenId, active: true});
        emit Deposited(depositId, msg.sender, nft, tokenId);
    }

    /// @notice Withdraw your active deposit back to your wallet.
    function withdraw(uint256 depositId) external nonReentrant {
        Deposit storage d = deposits[depositId];
        if (d.owner != msg.sender) revert NotOwner();
        if (!d.active) revert InactiveDeposit();

        d.active = false;
        IERC721(d.nft).safeTransferFrom(address(this), msg.sender, d.tokenId);
        emit Withdrawn(depositId, msg.sender);
    }

    /// @notice Swap your NFT with an active deposit. Atomically escrows caller NFT and swaps both assets.
    /// @return takerDepositId The deposit record created for the caller's NFT (closed within the same tx).
    function swap(uint256 targetDepositId, address nft, uint256 tokenId)
        external
        nonReentrant
        returns (uint256 takerDepositId)
    {
        Deposit storage target = deposits[targetDepositId];
        if (!target.active) revert InactiveDeposit();

        _validateNFT(nft);
        address taker = msg.sender;
        address targetOwner = target.owner;

        // Escrow taker's NFT first.
        IERC721(nft).safeTransferFrom(taker, address(this), tokenId);

        // Record taker's deposit (marked active then closed within this tx for traceability).
        takerDepositId = _nextId++;
        deposits[takerDepositId] = Deposit({owner: taker, nft: nft, tokenId: tokenId, active: true});

        // Swap assets.
        target.active = false;
        deposits[takerDepositId].active = false;

        IERC721(target.nft).safeTransferFrom(address(this), taker, target.tokenId);
        IERC721(nft).safeTransferFrom(address(this), targetOwner, tokenId);

        emit Swapped(targetDepositId, takerDepositId, taker, targetOwner, nft, tokenId);
    }

    /// @dev Accept all ERC-721 safe transfers.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    function _validateNFT(address nft) internal view {
        if (nft == address(0)) revert ZeroAddress();
        // Ensure the address supports ERC-721 interface.
        if (!IERC165(nft).supportsInterface(type(IERC721).interfaceId)) revert InvalidNFT();
    }
}
