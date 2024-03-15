// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";

import { IObject } from "../_interfaces/objects/IObject.sol";
import { IReferralProgram } from "../_interfaces/vaults/IReferralProgram.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import "hardhat/console.sol";

contract ReferralProgram is IReferralProgram, UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;
    IAddressBook addressBook;

    uint256 public constant DIVIDER = 10000;
    uint256 public rewarsRatio;

    mapping(address referrer => mapping(IObject object => mapping(uint256 stageId => uint256 rewardsUSD)))
        public rewards;

    mapping(address referral => mapping(IObject object => bool)) public referralHasObject;
    mapping(address referral => IObject[] objects) public referralObjects;

    event Claim(
        address indexed referrer,
        IERC20 indexed payToken,
        uint256 payTokenAmount,
        IObject indexed object,
        uint256 stageId
    );

    function initialize(address _addressBook, uint256 _rewarsRatio) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);

        require(_rewarsRatio != 0 && _rewarsRatio < DIVIDER, "_rewarsRatio!");
        rewarsRatio = _rewarsRatio;
    }

    function referralObjectsLength(address _referrer) public view returns (uint256) {
        return referralObjects[_referrer].length;
    }

    function registerSell(address _referrer, uint256 _stageId, uint256 _fullPriceUSD) external {
        IObject _object = IObject(msg.sender);
        addressBook.requireObject(_object);
        require(_referrer != address(0), "_referrer is zero!");

        uint256 rewardsUSD = (_fullPriceUSD * rewarsRatio) / DIVIDER;

        if (rewardsUSD == 0) return;

        if (referralHasObject[_referrer][_object] == false) {
            referralHasObject[_referrer][_object] = true;
            referralObjects[_referrer].push(_object);
        }
        rewards[_referrer][_object][_stageId] += rewardsUSD;
    }

    function payTokenAmount(
        address _referrer,
        IObject _object,
        uint256 _stageId,
        IERC20 _payToken
    ) external view returns (uint256) {
        uint256 _rewards = rewards[_referrer][_object][_stageId];
        if (_rewards == 0) return 0;
        return addressBook.pricersManager().usdAmountToToken(_rewards, _payToken);
    }

    function estimateClaimUSD(
        address _referrer,
        IObject _object,
        uint256 _stageId
    ) public view returns (uint256) {
        return rewards[_referrer][_object][_stageId];
    }
    
    function estimateClaimToken(
        address _referrer,
        IObject _object,
        uint256 _stageId,
        IERC20 _payToken
    ) public view returns (uint256) {
        uint256 _rewards = estimateClaimUSD(_referrer, _object, _stageId);
        if(_rewards == 0) return 0;
        return addressBook.pricersManager().usdAmountToToken(_rewards, _payToken);
    }

    function claim(
        IObject _object,
        uint256 _stageId,
        IERC20 _payToken,
        uint256 _minPayTokenAmount
    ) external {
        addressBook.pause().requireNotPaused();

        address _referrer = msg.sender;

        addressBook.requireObject(_object);
        _object.requireStageReady(_stageId);

        uint256 _payTokenAmount = estimateClaimToken(_referrer, _object, _stageId, _payToken);
        require(_payTokenAmount > 0, "rewards is zero!");
        require(_payTokenAmount >= _minPayTokenAmount, "_minPayTokenAmount!");

        delete rewards[_referrer][_object][_stageId];

        _payToken.safeTransfer(_referrer, _payTokenAmount);

        emit Claim(_referrer, _payToken, _payTokenAmount, _object, _stageId);
    }

    function withdrawToTreasury(IERC20 _token, uint256 _amount) external {
        IAddressBook _addressBook = addressBook;
        _addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_amount > 0, "_amounts is zero!");
        _token.safeTransfer(_addressBook.treasury(), _amount);
    }

    function setRewardsRatio(uint256 _rewardsRatio) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_rewardsRatio < DIVIDER, "_rewardsRatio >= DIVIDER");
        rewarsRatio = _rewardsRatio;
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
