// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CitizenSBT.sol";
import "./VotingRewardNFT.sol";

/// @title VotingWithSBT
/// @notice Voting contract that requires SBT verification before allowing votes.
/// @dev Integrates CitizenSBT for identity verification and VotingRewardNFT for rewards.
contract VotingWithSBT is Ownable {
    struct Proposal {
        string name;
        uint256 voteCount;
    }

    struct BallotMetadata {
        string id;
        string title;
        string description;
        uint256 opensAt;
        uint256 closesAt;
        uint256 announcesAt;
        uint256 expectedVoters;
    }

    /// @notice Reference to the CitizenSBT contract for identity verification
    CitizenSBT public immutable citizenSBT;

    /// @notice Reference to the VotingRewardNFT contract for issuing rewards
    VotingRewardNFT public immutable rewardNFT;

    /// @notice Array of proposals for this ballot
    Proposal[] private _proposals;

    /// @notice Metadata for this ballot
    BallotMetadata private _ballot;

    /// @notice Tracks which addresses have already voted
    mapping(address => bool) public hasVoted;

    /// @notice Tracks which addresses voted for which proposal
    mapping(address => uint256) public voterChoice;

    /// @notice Emitted when a proposal is added
    event ProposalAdded(uint256 indexed proposalId, string name);

    /// @notice Emitted when a vote is cast
    event VoteCast(
        address indexed voter, 
        uint256 indexed proposalId, 
        uint256 indexed rewardTokenId
    );

    /// @notice Emitted when ballot details are updated
    event BallotDetailsUpdated(string title, string description);

    /// @notice Emitted when ballot schedule is updated
    event BallotScheduleUpdated(uint256 opensAt, uint256 closesAt, uint256 announcesAt);

    /// @notice Emitted when expected voters count is updated
    event ExpectedVotersUpdated(uint256 expectedVoters);

    /// @dev Error thrown when voter doesn't have SBT
    error VoterNotVerified();

    /// @dev Error thrown when voter has already voted
    error AlreadyVoted();

    /// @dev Error thrown when proposal doesn't exist
    error ProposalDoesNotExist();

    /// @dev Error thrown when voting hasn't opened yet
    error VotingNotOpen();

    /// @dev Error thrown when voting has closed
    error VotingClosed();

    /// @dev Error thrown when ballot ID is empty
    error InvalidBallotId();

    /// @dev Error thrown when close time is before open time
    error InvalidSchedule();

    /// @notice Contract constructor
    /// @param citizenSBT_ Address of the CitizenSBT contract
    /// @param rewardNFT_ Address of the VotingRewardNFT contract
    /// @param proposalNames Array of initial proposal names
    /// @param ballotId Unique identifier for this ballot
    /// @param title_ Title of the ballot
    /// @param description_ Description of the ballot
    /// @param opensAt Timestamp when voting opens (0 = immediately)
    /// @param closesAt Timestamp when voting closes (0 = never)
    /// @param announcesAt Timestamp when results are announced
    /// @param expectedVoters Expected number of voters for turnout calculations
    constructor(
        address citizenSBT_,
        address rewardNFT_,
        string[] memory proposalNames,
        string memory ballotId,
        string memory title_,
        string memory description_,
        uint256 opensAt,
        uint256 closesAt,
        uint256 announcesAt,
        uint256 expectedVoters
    ) Ownable(msg.sender) {
        if (bytes(ballotId).length == 0) revert InvalidBallotId();
        if (closesAt != 0 && closesAt < opensAt) revert InvalidSchedule();
        if (announcesAt != 0 && closesAt != 0 && announcesAt < closesAt) {
            revert InvalidSchedule();
        }

        citizenSBT = CitizenSBT(citizenSBT_);
        rewardNFT = VotingRewardNFT(rewardNFT_);

        // Initialize proposals
        for (uint256 i = 0; i < proposalNames.length; i++) {
            _proposals.push(Proposal({
                name: proposalNames[i],
                voteCount: 0
            }));
            emit ProposalAdded(i, proposalNames[i]);
        }

        // Initialize ballot metadata
        _ballot = BallotMetadata({
            id: ballotId,
            title: title_,
            description: description_,
            opensAt: opensAt,
            closesAt: closesAt,
            announcesAt: announcesAt,
            expectedVoters: expectedVoters
        });

        emit BallotDetailsUpdated(title_, description_);
        emit BallotScheduleUpdated(opensAt, closesAt, announcesAt);
        emit ExpectedVotersUpdated(expectedVoters);
    }

    /// @notice Cast a vote for a proposal
    /// @dev Requires caller to have an SBT and not have voted yet
    /// @param proposalId The index of the proposal to vote for
    /// @return rewardTokenId The ID of the reward NFT issued
    function vote(uint256 proposalId) external returns (uint256 rewardTokenId) {
        // Check if proposal exists
        if (proposalId >= _proposals.length) revert ProposalDoesNotExist();

        // Check if voter has SBT (is verified)
        if (!citizenSBT.hasSBT(msg.sender)) revert VoterNotVerified();

        // Check if already voted
        if (hasVoted[msg.sender]) revert AlreadyVoted();

        // Check voting schedule
        if (_ballot.opensAt != 0 && block.timestamp < _ballot.opensAt) {
            revert VotingNotOpen();
        }
        if (_ballot.closesAt != 0 && block.timestamp > _ballot.closesAt) {
            revert VotingClosed();
        }

        // Record vote
        hasVoted[msg.sender] = true;
        voterChoice[msg.sender] = proposalId;
        _proposals[proposalId].voteCount += 1;

        // Issue reward NFT
        rewardTokenId = rewardNFT.mint(msg.sender, _ballot.id, proposalId);

        emit VoteCast(msg.sender, proposalId, rewardTokenId);
    }

    /// @notice Add a new proposal to the ballot
    /// @dev Only owner can add proposals
    /// @param name The name of the proposal
    /// @return proposalId The ID of the new proposal
    function addProposal(string calldata name) 
        external 
        onlyOwner 
        returns (uint256 proposalId) 
    {
        proposalId = _proposals.length;
        _proposals.push(Proposal({
            name: name,
            voteCount: 0
        }));
        emit ProposalAdded(proposalId, name);
    }

    /// @notice Check if an address can vote
    /// @param voter The address to check
    /// @return canVote True if the address can vote
    function canVote(address voter) external view returns (bool) {
        // Must have SBT
        if (!citizenSBT.hasSBT(voter)) return false;
        
        // Must not have voted
        if (hasVoted[voter]) return false;
        
        // Check schedule
        if (_ballot.opensAt != 0 && block.timestamp < _ballot.opensAt) {
            return false;
        }
        if (_ballot.closesAt != 0 && block.timestamp > _ballot.closesAt) {
            return false;
        }
        
        return true;
    }

    /// @notice Get the total number of proposals
    /// @return count The number of proposals
    function proposalCount() external view returns (uint256 count) {
        return _proposals.length;
    }

    /// @notice Get a proposal by ID
    /// @param proposalId The proposal ID
    /// @return proposal The proposal data
    function getProposal(uint256 proposalId) 
        external 
        view 
        returns (Proposal memory proposal) 
    {
        if (proposalId >= _proposals.length) revert ProposalDoesNotExist();
        return _proposals[proposalId];
    }

    /// @notice Get all proposals
    /// @return proposals Array of all proposals
    function getAllProposals() external view returns (Proposal[] memory proposals) {
        return _proposals;
    }

    /// @notice Get ballot metadata
    /// @return ballot The ballot metadata
    function ballotMetadata() external view returns (BallotMetadata memory ballot) {
        return _ballot;
    }

    /// @notice Update ballot details
    /// @dev Only owner can update
    /// @param title_ New title
    /// @param description_ New description
    function updateBallotDetails(
        string calldata title_,
        string calldata description_
    ) external onlyOwner {
        _ballot.title = title_;
        _ballot.description = description_;
        emit BallotDetailsUpdated(title_, description_);
    }

    /// @notice Update ballot schedule
    /// @dev Only owner can update
    /// @param opensAt New open timestamp
    /// @param closesAt New close timestamp
    /// @param announcesAt New announcement timestamp
    function updateBallotSchedule(
        uint256 opensAt,
        uint256 closesAt,
        uint256 announcesAt
    ) external onlyOwner {
        if (closesAt != 0 && closesAt < opensAt) revert InvalidSchedule();
        if (announcesAt != 0 && closesAt != 0 && announcesAt < closesAt) {
            revert InvalidSchedule();
        }
        
        _ballot.opensAt = opensAt;
        _ballot.closesAt = closesAt;
        _ballot.announcesAt = announcesAt;
        
        emit BallotScheduleUpdated(opensAt, closesAt, announcesAt);
    }

    /// @notice Update expected voters count
    /// @dev Only owner can update
    /// @param expectedVoters New expected voters count
    function updateExpectedVoters(uint256 expectedVoters) external onlyOwner {
        _ballot.expectedVoters = expectedVoters;
        emit ExpectedVotersUpdated(expectedVoters);
    }

    /// @notice Get voting statistics
    /// @return totalVotes Total number of votes cast
    /// @return turnoutPercentage Turnout percentage (basis points, e.g., 7500 = 75%)
    function getVotingStats() 
        external 
        view 
        returns (uint256 totalVotes, uint256 turnoutPercentage) 
    {
        totalVotes = 0;
        for (uint256 i = 0; i < _proposals.length; i++) {
            totalVotes += _proposals[i].voteCount;
        }
        
        if (_ballot.expectedVoters > 0) {
            turnoutPercentage = (totalVotes * 10000) / _ballot.expectedVoters;
        } else {
            turnoutPercentage = 0;
        }
    }
}
