// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IObject } from "../_interfaces/objects/IObject.sol";

contract EarningsPool is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook addressBook;

    event ClaimObjectRewards(
        address recipient,
        IObject object,
        uint256 tokenId,
        IERC20 payToken,
        uint256 payTokenAmount
    );

    function initialize(address _addressBook) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
    }

    function withdrawToTreasury(IERC20 _token, uint256 _amount) external {
        IAddressBook _addressBook = addressBook;
        _addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_amount > 0, "_amounts is zero!");
        _token.safeTransfer(_addressBook.treasury(), _amount);
    }

    function estimateClaimObjectRewardsUSD(
        IObject _object,
        uint256 _tokenId
    ) public view returns (uint256) {
        return _object.estimateRewardsUSD(_tokenId);
    }

    function estimateClaimObjectRewardsToken(
        IObject _object,
        uint256 _tokenId,
        IERC20 _payToken
    ) public view returns (uint256) {
        uint256 rewards = estimateClaimObjectRewardsUSD(_object, _tokenId);
        if (rewards == 0) return 0;
        return addressBook.pricersManager().usdAmountToToken(rewards, _payToken);
    }

    function claimObjectRewards(
        IObject _object,
        uint256 _tokenId,
        IERC20 _payToken,
        uint256 _minPayTokenAmount
    ) external {
        address _recipient = msg.sender;
        IAddressBook _addressBook = addressBook;

        _addressBook.pause().requireNotPaused();
        _addressBook.requireObject(_object);
        _object.requireTokenOwner(_recipient, _tokenId);

        uint256 payTokenAmount = estimateClaimObjectRewardsToken(_object, _tokenId, _payToken);
        require(payTokenAmount > 0, "not has rewards!");
        require(payTokenAmount >= _minPayTokenAmount, "_minPayTokenAmount!");

        _object.updateWithdrawnRewards(_tokenId);

        _payToken.safeTransfer(_recipient, payTokenAmount);

        emit ClaimObjectRewards(_recipient, _object, _tokenId, _payToken, payTokenAmount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
