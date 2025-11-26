// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    uint256 public nextId = 1;
    mapping(uint256 => string) public tokenToBallot;
    mapping(uint256 => uint8) public tokenRarity;

    constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextId++;
        _safeMint(to, tokenId);
    }

    function mintWithMeta(address to, string memory ballotId, uint8 rarity) external returns (uint256 tokenId) {
        tokenId = nextId++;
        tokenToBallot[tokenId] = ballotId;
        tokenRarity[tokenId] = rarity;
        _safeMint(to, tokenId);
    }

    function setTokenMeta(uint256 tokenId, string memory ballotId, uint8 rarity) external {
        tokenToBallot[tokenId] = ballotId;
        tokenRarity[tokenId] = rarity;
    }
}
