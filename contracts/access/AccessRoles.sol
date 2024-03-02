// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import { IAccessRoles } from "../_interfaces/access/IAccessRoles.sol";
import { IMultisigWallet } from "../_interfaces/access/IMultisigWallet.sol";
import "hardhat/console.sol";

contract AccessRoles is IAccessRoles, UUPSUpgradeable {
    IMultisigWallet public ownersMultisig;
    mapping(address account => bool) public administrators;
    address public deployer;

    function initialize(
        address _ownersMultisig,
        address[] calldata _administrators
    ) public initializer {
        require(_ownersMultisig != address(0), "_ownersMultisig is zero!");
        ownersMultisig = IMultisigWallet(_ownersMultisig);
        for (uint256 i; i < _administrators.length; ++i) {
            address administrator = _administrators[i];
            require(administrator != address(0), "_administrators contains zero address!");
            administrators[administrator] = true;
        }
        deployer = msg.sender;
    }

    function setOwnersMultisig(address _ownersMultisig) external {
        requireOwnersMultisig(msg.sender);
        bool supportsInterface;
        if (_ownersMultisig.code.length > 0) {
            try
                IERC165(_ownersMultisig).supportsInterface(type(IMultisigWallet).interfaceId)
            returns (bool result) {
                supportsInterface = result;
            } catch {}
        }

        require(supportsInterface, "not supported multisig wallet!");
        ownersMultisig = IMultisigWallet(_ownersMultisig);
    }

    function setDeployer(address _deployer) external {
        requireOwnersMultisig(msg.sender);
        deployer = _deployer;
    }

    function renounceDeployer() external {
        requireDeployer(msg.sender);
        delete deployer;
    }

    function requireDeployer(address _account) public view {
        require(_account == deployer, "only deployer!");
    }

    function requireOwnersMultisig(address _account) public view {
        require(_account == address(ownersMultisig), "only owners multisig!");
    }

    function requireAdministrator(address _account) external view {
        require(
            administrators[_account] || ownersMultisig.signers(_account),
            "only administrator!"
        );
    }

    function _authorizeUpgrade(address) internal view override {
        requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
