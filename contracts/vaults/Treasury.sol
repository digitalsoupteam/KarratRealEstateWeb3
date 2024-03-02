// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { ERC721HolderUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IObject } from "../_interfaces/objects/IObject.sol";

contract Treasury is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook public addressBook;

    function initialize(address _addressBook) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
    }

    function withdraw(IERC20 _token, uint256 _amount, address _recipient) public {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_amount > 0, "_amounts is zero!");
        _token.safeTransfer(_recipient, _amount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
