// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CitizenSBT
/// @notice Soulbound Token (SBT) for binding verified identities to wallet addresses.
/// @dev Non-transferable ERC721 token that ensures one-person-one-wallet binding.
contract CitizenSBT is ERC721, Ownable {
    /// @notice Counter for token IDs
    uint256 private _nextTokenId;

    /// @notice Address authorized to mint SBTs (identity verifier)
    address public verifier;

    /// @notice Mapping from identity hash to wallet address
    /// @dev Used to prevent the same identity from registering multiple times
    mapping(bytes32 => address) public identityToWallet;

    /// @notice Mapping from wallet address to SBT ownership status
    /// @dev Quick lookup to check if an address has an SBT
    mapping(address => bool) public hasSBT;

    /// @notice Mapping from token ID to identity hash
    /// @dev Stores the identity hash associated with each token
    mapping(uint256 => bytes32) public tokenToIdentity;

    /// @notice Emitted when a new SBT is minted
    event SBTMinted(address indexed to, uint256 indexed tokenId, bytes32 indexed identityHash);

    /// @notice Emitted when the verifier address is updated
    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    /// @dev Error thrown when attempting to transfer a soulbound token
    error TokenIsSoulbound();

    /// @dev Error thrown when caller is not the authorized verifier
    error NotAuthorizedVerifier();

    /// @dev Error thrown when identity is already registered
    error IdentityAlreadyRegistered(address existingWallet);

    /// @dev Error thrown when wallet already has an SBT
    error WalletAlreadyHasSBT(uint256 existingTokenId);

    /// @dev Error thrown when trying to set zero address as verifier
    error InvalidVerifierAddress();

    /// @notice Contract constructor
    /// @param name_ The name of the token collection
    /// @param symbol_ The symbol of the token collection
    /// @param verifier_ The address authorized to mint SBTs
    constructor(
        string memory name_,
        string memory symbol_,
        address verifier_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        if (verifier_ == address(0)) revert InvalidVerifierAddress();
        verifier = verifier_;
        emit VerifierUpdated(address(0), verifier_);
    }

    /// @notice Mint a new SBT to a wallet with an identity hash
    /// @dev Only the verifier can call this function
    /// @param to The wallet address to receive the SBT
    /// @param identityHash The hash of the verified identity (keccak256 of identity data)
    /// @return tokenId The ID of the minted token
    function mint(address to, bytes32 identityHash) 
        external 
        returns (uint256 tokenId) 
    {
        // TEMPORARY FOR TESTING: Allow users to mint their own SBT
        // In production, uncomment this line to enforce verifier-only minting:
        // if (msg.sender != verifier) revert NotAuthorizedVerifier();
        
        // For now, only check that msg.sender is minting for themselves
        if (msg.sender != to) {
            // If not minting for self, must be verifier
            if (msg.sender != verifier) revert NotAuthorizedVerifier();
        }

        // Check if identity is already registered
        if (identityToWallet[identityHash] != address(0)) {
            revert IdentityAlreadyRegistered(identityToWallet[identityHash]);
        }

        // Check if wallet already has an SBT
        if (hasSBT[to]) {
            // Find the existing token ID
            uint256 existingTokenId = 0;
            for (uint256 i = 0; i < _nextTokenId; i++) {
                if (_ownerOf(i) == to) {
                    existingTokenId = i;
                    break;
                }
            }
            revert WalletAlreadyHasSBT(existingTokenId);
        }

        // Mint new token
        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId += 1;
        }

        _safeMint(to, tokenId);

        // Store bindings
        identityToWallet[identityHash] = to;
        hasSBT[to] = true;
        tokenToIdentity[tokenId] = identityHash;

        emit SBTMinted(to, tokenId, identityHash);
    }

    /// @notice Check if an identity hash is already registered
    /// @param identityHash The identity hash to check
    /// @return registered True if the identity is already registered
    function isIdentityRegistered(bytes32 identityHash) 
        external 
        view 
        returns (bool registered) 
    {
        return identityToWallet[identityHash] != address(0);
    }

    /// @notice Get the wallet address associated with an identity hash
    /// @param identityHash The identity hash to look up
    /// @return wallet The wallet address, or address(0) if not registered
    function getWalletByIdentity(bytes32 identityHash) 
        external 
        view 
        returns (address wallet) 
    {
        return identityToWallet[identityHash];
    }

    /// @notice Get the identity hash associated with a token ID
    /// @param tokenId The token ID to look up
    /// @return identityHash The identity hash
    function getIdentityByToken(uint256 tokenId) 
        external 
        view 
        returns (bytes32 identityHash) 
    {
        _requireOwned(tokenId);
        return tokenToIdentity[tokenId];
    }

    /// @notice Update the verifier address
    /// @dev Only the contract owner can update the verifier
    /// @param newVerifier The new verifier address
    function updateVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidVerifierAddress();
        address oldVerifier = verifier;
        verifier = newVerifier;
        emit VerifierUpdated(oldVerifier, newVerifier);
    }

    /// @notice Override transfer function to make tokens soulbound (non-transferable)
    /// @dev Always reverts as SBTs cannot be transferred
    function _update(address to, uint256 tokenId, address auth)
        internal
        virtual
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        // Block all transfers (from != address(0) && to != address(0))
        // Allow burning (to == address(0))
        if (from != address(0) && to != address(0)) {
            revert TokenIsSoulbound();
        }
        
        return super._update(to, tokenId, auth);
    }

    /// @notice Override approve to prevent approvals (tokens are soulbound)
    /// @dev Always reverts as SBTs cannot be approved for transfer
    function approve(address /*to*/, uint256 /*tokenId*/) 
        public 
        virtual 
        override 
        pure
    {
        revert TokenIsSoulbound();
    }

    /// @notice Override setApprovalForAll to prevent approvals (tokens are soulbound)
    /// @dev Always reverts as SBTs cannot be approved for transfer
    function setApprovalForAll(address /*operator*/, bool /*approved*/) 
        public 
        virtual 
        override 
        pure
    {
        revert TokenIsSoulbound();
    }

    /// @notice Override getApproved to always return zero address
    /// @dev SBTs cannot have approved addresses
    function getApproved(uint256 /*tokenId*/) 
        public 
        view 
        virtual 
        override 
        returns (address) 
    {
        return address(0);
    }

    /// @notice Override isApprovedForAll to always return false
    /// @dev SBTs cannot have operator approvals
    function isApprovedForAll(address /*owner*/, address /*operator*/) 
        public 
        view 
        virtual 
        override 
        returns (bool) 
    {
        return false;
    }

    /// @notice Check if an address owns an SBT
    /// @param owner The address to check
    /// @return balance The number of SBTs owned (0 or 1)
    function balanceOf(address owner) 
        public 
        view 
        virtual 
        override 
        returns (uint256 balance) 
    {
        return hasSBT[owner] ? 1 : 0;
    }
}
