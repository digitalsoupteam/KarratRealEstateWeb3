// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IPricer } from "../_interfaces/pricers/IPricer.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

contract Pricer is IPricer, UUPSUpgradeable {
    IAddressBook public addressBook;
    int256 public currentPrice;
    string public description;

    event SetPrice(int256 oldPrice, int256 newPrice);

    function initialize(
        address _addressBook,
        int256 _initialPrice,
        string calldata _description
    ) public initializer {
        addressBook = IAddressBook(_addressBook);
        currentPrice = _initialPrice;
        description = _description;
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
    
    function setCurrentPrice(int256 _newPrice) external {
        // ? bot access
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_newPrice > 0, "price is zero!");

        int256 oldPrice = currentPrice;
        currentPrice = _newPrice;

        emit SetPrice(oldPrice, _newPrice);
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        answer = currentPrice;
    }
}