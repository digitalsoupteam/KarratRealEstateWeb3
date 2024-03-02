// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IAccessRoles } from "../_interfaces/access/IAccessRoles.sol";
import { IPause } from "../_interfaces/access/IPause.sol";
import { IPricersManager } from "../_interfaces/pricers/IPricersManager.sol";
import { IEarningsPool } from "../_interfaces/vaults/IEarningsPool.sol";
import { IObject } from "../_interfaces/objects/IObject.sol";
import { IReferralProgram } from "../_interfaces/vaults/IReferralProgram.sol";

contract AddressBook is IAddressBook, UUPSUpgradeable {
    IAccessRoles public accessRoles;
    IPause public pause;
    address public treasury;
    IPricersManager public pricersManager;
    IEarningsPool public earningsPool;
    address public administratorFund;
    address public buyBackFund;
    IReferralProgram public referralProgram;
    address public objectsFactory;
    mapping(IObject object => bool) public objects;

    function initialize(address _accessRoles) public initializer {
        require(_accessRoles != address(0), "_accessRoles is zero!");
        accessRoles = IAccessRoles(_accessRoles);
    }

    function requireBuyBackFund(address _contract) external view {
        require(_contract == buyBackFund, "only buy back fund!");
    }

    function requireEarningsPool(IEarningsPool _contract) external view {
        require(_contract == earningsPool, "only earnings pool!");
    }

    function requireObject(IObject _contract) external view {
        require(objects[_contract], "only object!");
    }


    function requireObjectsFactory(address _contract) public view {
        require(_contract == objectsFactory, "only objectsFactory!");
    }

    function initialSetPause(address _pause) external {
        accessRoles.requireDeployer(msg.sender);
        require(_pause != address(0), "_pause is zero!");
        require(address(pause) == address(0), "pause contract exists!");
        pause = IPause(_pause);
    }

    function addObject(IObject _object) external {
        requireObjectsFactory(msg.sender);
        objects[_object] = true;
    }

    function initialSetPricersManager(address _pricersManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_pricersManager != address(0), "_pause is zero!");
        require(address(pricersManager) == address(0), "pricersManager contract exists!");
        pricersManager = IPricersManager(_pricersManager);
    }
    function initialSetObjectsFactory(address _objectsFactory) external {
        accessRoles.requireDeployer(msg.sender);
        require(_objectsFactory != address(0), "_objectsFactory is zero!");
        require(objectsFactory == address(0), "objectsFactory contract exists!");
        objectsFactory = _objectsFactory;
    }

    function initialSetEarningsPool(address _earningsPool) external {
        accessRoles.requireDeployer(msg.sender);
        require(_earningsPool != address(0), "_pause is zero!");
        require(address(earningsPool) == address(0), "earningsPool contract exists!");
        earningsPool = IEarningsPool(_earningsPool);
    }

    function initialSetTreasury(address _treasury) external {
        accessRoles.requireDeployer(msg.sender);
        require(_treasury != address(0), "_treasury is zero!");
        require(treasury == address(0), "treasury contract exists!");
        treasury = _treasury;
    }

    function initialSetBuyBackFund(address _buyBackFund) external {
        accessRoles.requireDeployer(msg.sender);
        require(_buyBackFund != address(0), "_buyBackFund is zero!");
        require(buyBackFund == address(0), "buyBackFund contract exists!");
        buyBackFund = _buyBackFund;
    }

    function initialSetReferralProgram(address _referralProgram) external {
        accessRoles.requireDeployer(msg.sender);
        require(_referralProgram != address(0), "_referralProgram is zero!");
        require(address(referralProgram) == address(0), "referralProgram contract exists!");
        referralProgram = IReferralProgram(_referralProgram);
    }


    function initialSetAdministratorFund(address _administratorFund) external {
        accessRoles.requireDeployer(msg.sender);
        require(_administratorFund != address(0), "_administratorFund is zero!");
        require(administratorFund == address(0), "administratorFund contract exists!");
        administratorFund = _administratorFund;
    }


    function _authorizeUpgrade(address) internal view override {
        accessRoles.requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
