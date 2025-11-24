// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title NFTEscrow
/// @notice Minimal escrow for depositing ERC721 tokens and swapping them atomically.
contract NFTEscrow is IERC721Receiver, ReentrancyGuard {
    /// @notice Deposit metadata.
    struct Deposit {
        address owner;
        address nft;
        uint256 tokenId;
        bool active;
    }

    /// @notice Stored deposits keyed by depositId.
    mapping(uint256 => Deposit) public deposits;

    /// @notice Next deposit identifier.
    uint256 public nextDepositId = 1;

    event Deposited(uint256 indexed depositId, address indexed owner, address indexed nft, uint256 tokenId);
    event Withdrawn(uint256 indexed depositId, address indexed owner);
    event Swapped(
        uint256 indexed myDepositId,
        uint256 indexed targetDepositId,
        address indexed initiator,
        address counterparty
    );

    error ZeroAddress();
    error InvalidDeposit();
    error NotOwner();
    error InactiveDeposit();
    error SelfSwap();

    /// @notice Deposit an ERC721 into escrow.
    /// @param nft NFT contract address.
    /// @param tokenId Token id to deposit.
    /// @return depositId Identifier assigned to the deposit.
    function deposit(address nft, uint256 tokenId) external nonReentrant returns (uint256 depositId) {
        if (nft == address(0)) {
            revert ZeroAddress();
        }

        depositId = nextDepositId++;
        deposits[depositId] = Deposit({owner: msg.sender, nft: nft, tokenId: tokenId, active: true});

        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);
        emit Deposited(depositId, msg.sender, nft, tokenId);
    }

    /// @notice Swap two active deposits.
    /// @param myDepositId Deposit owned by the caller.
    /// @param targetDepositId Deposit owned by the counterparty.
    function swap(uint256 myDepositId, uint256 targetDepositId) external nonReentrant {
        if (myDepositId == targetDepositId) {
            revert SelfSwap();
        }

        Deposit storage my = deposits[myDepositId];
        Deposit storage target = deposits[targetDepositId];

        if (my.owner == address(0) || target.owner == address(0)) {
            revert InvalidDeposit();
        }
        if (!my.active || !target.active) {
            revert InactiveDeposit();
        }
        if (my.owner != msg.sender) {
            revert NotOwner();
        }

        address myOwner = my.owner;
        address targetOwner = target.owner;

        my.owner = targetOwner;
        target.owner = myOwner;

        IERC721(my.nft).safeTransferFrom(address(this), targetOwner, my.tokenId);
        IERC721(target.nft).safeTransferFrom(address(this), myOwner, target.tokenId);

        emit Swapped(myDepositId, targetDepositId, msg.sender, targetOwner);
    }

    /// @notice Withdraw a deposited NFT back to the owner.
    /// @param depositId Identifier of the deposit to withdraw.
    function withdraw(uint256 depositId) external nonReentrant {
        Deposit storage userDeposit = deposits[depositId];

        if (userDeposit.owner == address(0)) {
            revert InvalidDeposit();
        }
        if (!userDeposit.active) {
            revert InactiveDeposit();
        }
        if (userDeposit.owner != msg.sender) {
            revert NotOwner();
        }

        userDeposit.active = false;
        address owner = userDeposit.owner;
        address nft = userDeposit.nft;
        uint256 tokenId = userDeposit.tokenId;

        IERC721(nft).safeTransferFrom(address(this), owner, tokenId);
        emit Withdrawn(depositId, owner);
    }

    /// @inheritdoc IERC721Receiver
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
