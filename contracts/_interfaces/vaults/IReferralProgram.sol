// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IReferralProgram {
    function registerSell(
        address _referrer,
        uint256 _stageId,
        uint256 _fullPriceUSD
    ) external;
}
