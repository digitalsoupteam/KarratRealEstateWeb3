// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IPricersManager } from "../_interfaces/pricers/IPricersManager.sol";
import { IPricer } from "../_interfaces/pricers/IPricer.sol";

contract PricersManager is IPricersManager, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook public addressBook;

    uint256 constant USD_DECIMALS = 18;
    uint256 constant PRICERS_DECIMALS = 8;

    mapping(IERC20 token => IPricer pricer) public pricers;

    function initialize(
        address _addressBook,
        IERC20[] calldata _tokens,
        IPricer[] calldata _pricers
    ) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        require(_tokens.length == _pricers.length, "_tokens length != _pricers length");
        for (uint256 i; i < _pricers.length; ++i) {
            require(address(_tokens[i]) != address(0), "token is zero!");
            require(address(_pricers[i]) != address(0), "pricer is zero!");
            require(address(_tokens[i]) != address(_pricers[i]), "token == pricer");

            require(_pricers[i].decimals() == PRICERS_DECIMALS, "PRICERS_DECIMALS!");
            pricers[_tokens[i]] = _pricers[i];

            require(getPrice(_tokens[i]) > 0, "pricer current price is zero!");
        }
    }

    function getPrice(IERC20 _token) public view returns (uint256) {
        IPricer pricer = pricers[_token];
        require(address(pricer) != address(0), "pricer not exists!");
        (, int256 price, , , ) = pricer.latestRoundData();
        require(price > 0, "price not exists!");
        return uint256(price);
    }

    function usdAmountToToken(
        uint256 _usdAmount,
        IERC20 _token
    ) external view returns (uint256 tokenAmount) {
        require(_usdAmount > 0, "_usdAmount is zero!");
        tokenAmount =
            (_usdAmount *
                (10 ** IERC20Metadata(address(_token)).decimals()) *
                (10 ** PRICERS_DECIMALS)) /
            getPrice(_token) /
            10 ** USD_DECIMALS;
        require(tokenAmount > 0, "tokenAmount is zero!");
    }

    function requireTokenSupport(IERC20 _token) external view {
        require(address(pricers[_token]) != address(0), "token not supported!");
    }

    function setPricer(IERC20 _token, IPricer _pricer) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(address(_token) != address(0), "_token is zero!");
        require(address(_pricer) != address(0), "_pricer is zero!");
        require(_pricer.decimals() == PRICERS_DECIMALS, "PRICERS_DECIMALS!");

        pricers[_token] = _pricer;

        require(getPrice(_token) > 0, "current price is zero!");
    }

    function deleteToken(IERC20 _token) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(address(_token) != address(0), "_token is zero!");
        require(address(pricers[_token]) != address(0), "pricer not exists!");
        delete pricers[_token];
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
