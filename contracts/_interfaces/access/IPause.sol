// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IPause {
    function requireNotPaused() external view;
}
