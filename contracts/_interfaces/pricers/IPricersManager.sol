// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPricersManager {
    function requireTokenSupport(IERC20 _token) external view;
    function getPrice(IERC20 _token) external view returns(uint256);
    function usdAmountToToken(uint256 _usdAmount, IERC20 _token) external view returns (uint256 tokenAmount);
}
