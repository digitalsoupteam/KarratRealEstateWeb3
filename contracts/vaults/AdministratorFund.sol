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

contract AdministratorFund is UUPSUpgradeable, MulticallUpgradeable, ERC721HolderUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook public addressBook;

    mapping(address recipient => uint256 amountUSD) public dailyLimit;
    mapping(address recipient => mapping(uint256 dayIndex => uint256 amount)) public deposits;

    uint256 internal _initialTimestamp;

    function initialize(
        address _addressBook,
        address[] calldata _recipients,
        uint256[] calldata _dailyLimits
    ) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);

        require(_recipients.length == _dailyLimits.length, "_recipients.length!");
        for (uint256 i; i < _recipients.length; ++i) {
            dailyLimit[_recipients[i]] = _dailyLimits[i];
        }

        _initialTimestamp = block.timestamp;
    }

    function currentDayIndex() public view returns (uint256) {
        return (block.timestamp - _initialTimestamp) / 1 days;
    }

    function setDailyLimit(address _recipient, uint256 _amoutUSD) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        dailyLimit[_recipient] = _amoutUSD;
    }

    function depositTo(address _recipient, IERC20 _token, uint256 _amountUSD) external {
        IAddressBook _addressBook = addressBook;
        _addressBook.accessRoles().requireAdministrator(msg.sender);

        uint256 _dailyLimit = dailyLimit[_recipient];
        require(_dailyLimit > 0, "not approved recipient!");

        uint256 dayIndex = currentDayIndex();
        deposits[_recipient][dayIndex] += _amountUSD;
        require(deposits[_recipient][dayIndex] <= _dailyLimit, "daily limit!");

        _token.safeTransfer(
            _recipient,
            _addressBook.pricersManager().usdAmountToToken(_amountUSD, _token)
        );
    }

    function withdrawToTreasury(IERC20 _token, uint256 _amount) external {
        IAddressBook _addressBook = addressBook;
        _addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_amount > 0, "_amounts is zero!");
        _token.safeTransfer(_addressBook.treasury(), _amount);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
