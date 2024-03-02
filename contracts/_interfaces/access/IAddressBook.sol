// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IAccessRoles } from "./IAccessRoles.sol";
import { IPause } from "./IPause.sol";
import { IPricersManager } from "../pricers/IPricersManager.sol";
import { IObject } from "../objects/IObject.sol";
import { IEarningsPool } from "../vaults/IEarningsPool.sol";
import { IReferralProgram } from "../vaults/IReferralProgram.sol";

interface IAddressBook {
    function accessRoles() external view returns (IAccessRoles);
    function pause() external view returns (IPause);
    function treasury() external view returns (address);
    function buyBackFund() external view returns (address);
    function earningsPool() external view returns (IEarningsPool);
    function referralProgram() external view returns (IReferralProgram);
    function pricersManager() external view returns (IPricersManager);
    function objects(IObject object) external view returns (bool);
    function addObject(IObject object) external;
    function requireEarningsPool(IEarningsPool _account) external view;
    function requireObject(IObject _contract) external view;
    function requireBuyBackFund(address _contract) external view;
    function requireObjectsFactory(address _contract) external view;
}
