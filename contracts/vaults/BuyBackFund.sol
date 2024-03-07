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

    function setBuyBackOneSharePrice(IObject _object, uint256 _oneShareSellBackPriceUSD) external {
        IAddressBook _addressBook = addressBook;
        _addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        _addressBook.requireObject(_object);
        oneShareSellBackPrice[_object] = _oneShareSellBackPriceUSD;
    }

    function estimateSellBackUSD(
        IObject _object,
        uint256 _tokenId
    ) public view returns (uint256) {
        return _object.tokenShares(_tokenId) * oneShareSellBackPrice[_object];
    }

    function estimateSellBackToken(
        IObject _object,
        uint256 _tokenId,
        IERC20 _payToken
    ) public view returns (uint256) {
        uint256 rewardsUSD = estimateSellBackUSD(_object, _tokenId);
        if(rewardsUSD == 0) return 0;
        return
            addressBook.pricersManager().usdAmountToToken(
                rewardsUSD,
                _payToken
            );
    }

    function sellBack(
        IObject _object,
        uint256 _tokenId,
        IERC20 _payToken,
        uint256 _minPayTokenAmount
    ) external {
        address _recipient = msg.sender;
        IAddressBook _addressBook = addressBook;

        uint256 _oneShareSellBackPrice = oneShareSellBackPrice[_object];

        require(_oneShareSellBackPrice > 0, "buy back price is zero!");

        _addressBook.pause().requireNotPaused();
        _addressBook.requireObject(_object);
        _object.requireTokenReady(_tokenId);
        _object.requireTokenOwner(_recipient, _tokenId);

        _object.buyBack(_tokenId);

        uint256 payTokenAmount = estimateSellBackToken(_object, _tokenId, _payToken);
        require(payTokenAmount > 0, "not has rewards!");
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
