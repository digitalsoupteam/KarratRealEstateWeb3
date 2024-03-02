// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

interface IAccessRoles {
    function requireDeployer(address _account) external view;

    function requireOwnersMultisig(address _account) external view;

    function requireAdministrator(address _account) external view;
}
