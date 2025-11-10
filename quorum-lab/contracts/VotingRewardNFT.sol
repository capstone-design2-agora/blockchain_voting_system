// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VotingRewardNFT
/// @notice Transferable NFT rewards issued to voters after they cast their vote.
/// @dev Each NFT contains metadata with mascot images specific to each ballot.
contract VotingRewardNFT is ERC721URIStorage, Ownable {
    /// @notice Counter for token IDs
    uint256 private _nextTokenId;

    /// @notice Base URI for token metadata
    string private _baseTokenURI;

    /// @notice Addresses authorized to mint reward NFTs (voting contracts)
    mapping(address => bool) public authorizedMinters;

    /// @notice Mapping from token ID to ballot ID
    /// @dev Links each NFT to the ballot it was issued for
    mapping(uint256 => string) public tokenToBallot;

    /// @notice Mapping from ballot ID to mascot image URI
    /// @dev Each ballot can have a unique mascot image
    mapping(string => string) public ballotMascots;

    /// @notice Mapping from token ID to voter address and timestamp
    struct VoteRecord {
        address voter;
        uint256 timestamp;
        uint256 proposalId;
    }
    mapping(uint256 => VoteRecord) public voteRecords;

    /// @notice Emitted when a reward NFT is minted
    event RewardMinted(
        address indexed to, 
        uint256 indexed tokenId, 
        string ballotId,
        uint256 proposalId
    );

    /// @notice Emitted when a mascot image is set for a ballot
    event MascotSet(string indexed ballotId, string imageURI);

    /// @notice Emitted when base URI is updated
    event BaseURIUpdated(string newBaseURI);

    /// @notice Emitted when a minter is authorized or deauthorized
    event MinterUpdated(address indexed minter, bool authorized);

    /// @dev Error thrown when caller is not an authorized minter
    error NotAuthorizedMinter();

    /// @dev Error thrown when ballot ID is empty
    error InvalidBallotId();

    /// @notice Contract constructor
    /// @param name_ The name of the NFT collection
    /// @param symbol_ The symbol of the NFT collection
    /// @param baseTokenURI_ The base URI for token metadata
    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseTokenURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _baseTokenURI = baseTokenURI_;
        emit BaseURIUpdated(baseTokenURI_);
    }

    /// @notice Mint a reward NFT to a voter
    /// @dev Only authorized minters (voting contracts) can call this
    /// @param to The address to receive the NFT
    /// @param ballotId The ID of the ballot this vote was cast in
    /// @param proposalId The proposal ID that was voted for
    /// @return tokenId The ID of the minted token
    function mint(
        address to,
        string memory ballotId,
        uint256 proposalId
    ) external returns (uint256 tokenId) {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();
        if (bytes(ballotId).length == 0) revert InvalidBallotId();

        tokenId = _nextTokenId;
        unchecked {
            _nextTokenId += 1;
        }

        _safeMint(to, tokenId);

        // Store metadata
        tokenToBallot[tokenId] = ballotId;
        voteRecords[tokenId] = VoteRecord({
            voter: to,
            timestamp: block.timestamp,
            proposalId: proposalId
        });

        // Set token URI if mascot exists for this ballot
        string memory mascotURI = ballotMascots[ballotId];
        if (bytes(mascotURI).length > 0) {
            _setTokenURI(tokenId, mascotURI);
        }

        emit RewardMinted(to, tokenId, ballotId, proposalId);
    }

    /// @notice Set mascot image URI for a ballot
    /// @dev Only owner can set mascot images
    /// @param ballotId The ballot ID
    /// @param imageURI The IPFS or HTTP URI for the mascot image
    function setMascot(string memory ballotId, string memory imageURI) 
        external 
        onlyOwner 
    {
        if (bytes(ballotId).length == 0) revert InvalidBallotId();
        ballotMascots[ballotId] = imageURI;
        emit MascotSet(ballotId, imageURI);
    }

    /// @notice Authorize or deauthorize a minter
    /// @dev Only owner can manage minter permissions
    /// @param minter The address to authorize/deauthorize
    /// @param authorized True to authorize, false to deauthorize
    function setMinterAuthorization(address minter, bool authorized) 
        external 
        onlyOwner 
    {
        authorizedMinters[minter] = authorized;
        emit MinterUpdated(minter, authorized);
    }

    /// @notice Update the base token URI
    /// @dev Only owner can update base URI
    /// @param newBaseURI The new base URI
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    /// @notice Get the ballot ID for a token
    /// @param tokenId The token ID to look up
    /// @return ballotId The ballot ID
    function getBallotId(uint256 tokenId) 
        external 
        view 
        returns (string memory ballotId) 
    {
        _requireOwned(tokenId);
        return tokenToBallot[tokenId];
    }

    /// @notice Get vote record for a token
    /// @param tokenId The token ID to look up
    /// @return record The vote record
    function getVoteRecord(uint256 tokenId) 
        external 
        view 
        returns (VoteRecord memory record) 
    {
        _requireOwned(tokenId);
        return voteRecords[tokenId];
    }

    /// @notice Get all token IDs owned by an address
    /// @param owner The address to query
    /// @return tokenIds Array of token IDs owned by the address
    function tokensOfOwner(address owner) 
        external 
        view 
        returns (uint256[] memory tokenIds) 
    {
        uint256 balance = balanceOf(owner);
        tokenIds = new uint256[](balance);
        
        uint256 index = 0;
        for (uint256 i = 0; i < _nextTokenId && index < balance; i++) {
            if (_ownerOf(i) == owner) {
                tokenIds[index] = i;
                index++;
            }
        }
    }

    /// @notice Returns the base URI for computing tokenURI
    /// @return The base token URI string
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Get the total number of minted tokens
    /// @return The total supply
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }
}
