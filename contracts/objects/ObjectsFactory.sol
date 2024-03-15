// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { ERC1967ProxyCreate2 } from "../utils/ERC1967ProxyCreate2.sol";

import { IObject } from "../_interfaces/objects/IObject.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

contract ObjectsFactory is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook addressBook;

    address objectImplementation;

    uint256 public lastObjectId;

    function initialize(address _addressBook, address _objectImplementation) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_objectImplementation != address(0), "_objectImplementation is zero!");
        addressBook = IAddressBook(_addressBook);
        objectImplementation = _objectImplementation;
    }

    function objectAddress(uint256 _objectId) public view returns (address) {
        return
            address(
                uint160(
                    uint(
                        keccak256(
                            abi.encodePacked(
                                bytes1(0xff),
                                address(this),
                                keccak256(abi.encodePacked(_objectId)),
                                keccak256(type(ERC1967ProxyCreate2).creationCode)
                            )
                        )
                    )
                )
            );
    }

    function createStageSaleObject(
        uint256 _maxShares,
        uint256 _intialStageAvailableShares,
        uint256 _intialStageSaleStopTimestamp,
        uint256 _priceOneShare,
        bool _referralProgramEnabled
    ) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        ERC1967ProxyCreate2 newObject = new ERC1967ProxyCreate2{
            salt: keccak256(abi.encodePacked(++lastObjectId))
        }();
        newObject.init(
            objectImplementation,
            abi.encodeWithSelector(
                IObject.initialize.selector,
                addressBook,
                _maxShares,
                _intialStageAvailableShares,
                _intialStageSaleStopTimestamp,
                _priceOneShare,
                _referralProgramEnabled
            )
        );
        addressBook.addObject(IObject(address(newObject)));
    }

    function createFullSaleObject(
        uint256 _maxShares,
        uint256 _saleStopTimestamp,
        uint256 _priceOneShare,
        bool _referralProgramEnabled
    ) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        ERC1967ProxyCreate2 newObject = new ERC1967ProxyCreate2{
            salt: keccak256(abi.encodePacked(++lastObjectId))
        }();
        newObject.init(
            objectImplementation,
            abi.encodeWithSelector(
                IObject.initialize.selector,
                addressBook,
                _maxShares,
                _maxShares,
                _saleStopTimestamp,
                _priceOneShare,
                _referralProgramEnabled
            )
        );
        addressBook.addObject(IObject(address(newObject)));
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
