// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IObject } from "../objects/IObject.sol";

interface IEarningsPool {
    function claimObjectRewards(IObject _object, uint256 _tokenId) external;
}
