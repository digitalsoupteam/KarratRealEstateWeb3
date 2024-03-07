// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IObject {
    function tokenShares(uint256 _tokenId) external view returns (uint256);

    function updateWithdrawnRewards(uint256 _tokenId) external returns (uint256 rewardsUSD);

    function estimateRewardsUSD(uint256 _tokenId) external view returns (uint256);

    function getSellBackPrice(uint256 _tokenId) external view returns (uint256 priceUSD);

    function splitToken(
        uint256 _tokenId,
        uint256 _rightShares
    ) external returns (uint256 rightTokenId);

    function requireStageReady(uint256 _stageId) external view;

    function requireTokenOwner(address _account, uint256 _tokenId) external view;

    function buyBack(uint256 _tokenId) external;

    function requireTokenReady(uint256 _tokenId) external view;

    function initialize(
        address _addressBook,
        uint256 _maxShares,
        uint256 _initialStageAvailableShares,
        uint256 _initialStageSaleStopTimestamp,
        uint256 _currentPriceOneShare,
        bool _referralProgramEnabled
    ) external;
}
