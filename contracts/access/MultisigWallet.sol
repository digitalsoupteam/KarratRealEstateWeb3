// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IMultisigWallet } from "../_interfaces/access/IMultisigWallet.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

contract MultisigWallet is IMultisigWallet, UUPSUpgradeable, ERC165 {
    using SafeERC20 for IERC20;

    uint256 public requiredSigners;
    mapping(address => bool) public signers;
    address[] public owners;
    uint256 public signersCount;

    uint256 public txsCount;
    mapping(uint256 txId => address creator) public txCreator;
    mapping(uint256 txId => address) public txTarget;
    mapping(uint256 txId => uint256) public txValue;
    mapping(uint256 txId => bytes) public txData;
    mapping(uint256 txId => bool) public txExecuted;
    mapping(uint256 txId => mapping(address signer => bool accepted)) public txConfirmations;
    mapping(uint256 txId => uint256 count) public txConfirmationsCount;

    function initialize(
        uint256 _requiredSigners,
        address[] calldata _signers
    ) public initializer {
        require(_requiredSigners > 0, "_requiredSigners must be greater than zero!");
        require(_signers.length >= _requiredSigners, "_requiredSigners > _signers.length");
        requiredSigners = _requiredSigners;
        for (uint256 i; i < _signers.length; ++i) {
            require(_signers[i] != address(0), "_signers contains zero address!");
            signers[_signers[i]] = true;
            ++signersCount;
        }
        owners = _signers;
    }

    function withdraw(address _recipient, address _token, uint256 _amount) external {
        _requireSelfCall();
        if(_token == address(0)) {
            (bool result,) = _recipient.call{value: _amount}("");
            require(result, "native transfger failed!");
        } else {
            IERC20(_token).safeTransfer(_recipient, _amount);
        }
    }

    function submitTransaction(address _target, uint256 _value, bytes calldata _data) external payable {
        require(_value == msg.value, "_value != msg.value");
        _requireNotSelfCall();
        _requireSigner();
        uint256 txId = ++txsCount;
        txCreator[txId] = msg.sender;
        txTarget[txId] = _target;
        txValue[txId] = _value;
        txData[txId] = _data;
        
        _confirmTransaction(txId);
    }

    function acceptTransaction(uint256 _txId) external {
        _requireNotSelfCall();
        _requireSigner();
        _requireTransactionExists(_txId);
        _requireNotExecuted(_txId);
        require(txConfirmations[_txId][msg.sender] == false, "already confirmed!");

        _confirmTransaction(_txId);
    }

    function _confirmTransaction(uint256 _txId) internal {
        txConfirmations[_txId][msg.sender] = true;
        txConfirmationsCount[_txId]++;

        if (txConfirmationsCount[_txId] >= requiredSigners) {
            txExecuted[_txId] = true;
            (bool success, ) = txTarget[_txId].call{ value: txValue[_txId] }(txData[_txId]);
            require(success, "transaction call failure!");
        }
    }

    function revokeTransaction(uint256 _txId) external {
        _requireNotSelfCall();
        _requireSigner();
        _requireTransactionExists(_txId);
        _requireNotExecuted(_txId);
        require(txConfirmations[_txId][msg.sender], "not confirmed!");

        delete txConfirmations[_txId][msg.sender];
        --txConfirmationsCount[_txId];
    }

    function getTransaction(
        uint256 _txId,
        address _signer
    )
        external
        view
        returns (
            address target,
            uint256 value,
            bytes memory data,
            address creator,
            bool executed,
            uint256 confirmationsCount,
            bool alreadySigned
        )
    {
        _requireTransactionExists(_txId);
        target = txTarget[_txId];
        value = txValue[_txId];
        data = txData[_txId];
        creator = txCreator[_txId];
        executed = txExecuted[_txId];
        confirmationsCount = txConfirmationsCount[_txId];
        alreadySigned = txConfirmations[_txId][_signer];
    }

    function _requireSelfCall() internal view {
        require(msg.sender == address(this), "only mutisig!");
    }

    function _requireNotSelfCall() internal view {
        require(msg.sender != address(this), "self call disabled!");
    }

    function _requireNotExecuted(uint256 _txId) internal view {
        require(txExecuted[_txId] == false, "tx already executed!");
    }

    function _requireSigner() internal view {
        require(signers[msg.sender], "only signer!");
    }

    function _requireTransactionExists(uint256 _txId) internal view {
        require(_txId <= txsCount && _txId != 0, "not found txId!");
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(IMultisigWallet).interfaceId ||
            super.supportsInterface(interfaceId);
    }


    function _authorizeUpgrade(address) internal view override {
        _requireSelfCall();
    }

    constructor() {
        _disableInitializers();
    }
}
