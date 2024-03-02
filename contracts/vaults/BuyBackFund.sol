// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IObject } from "../_interfaces/objects/IObject.sol";

contract BuyBackFund is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook public addressBook;

    mapping(IObject object => uint256 priceUSD) public oneShareSellBackPrice;

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

    function sellBack(
        IObject _object,
        uint256 _tokenId,
        IERC20 _payToken,
        uint256 _minPayTokenAmount
    ) external {
        address _recipient = msg.sender;
        IAddressBook _addressBook = addressBook;

        _addressBook.pause().requireNotPaused();
        _addressBook.requireObject(_object);
        _object.requireTokenReady(_tokenId);
        _object.requireTokenOwner(_recipient, _tokenId);

        _object.buyBack(_tokenId);

        uint256 rewards = _object.shares(_tokenId) * oneShareSellBackPrice[_object];
        require(rewards > 0, "not has rewards!");

        uint256 payTokenAmount = _addressBook.pricersManager().usdAmountToToken(rewards, _payToken);
        require(payTokenAmount >= _minPayTokenAmount, "_minPayTokenAmount!");

        _payToken.safeTransfer(_recipient, payTokenAmount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
