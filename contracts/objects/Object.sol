// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { ERC721EnumerableUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

import { IObject } from "../_interfaces/objects/IObject.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IReferralProgram } from "../_interfaces/vaults/IReferralProgram.sol";
import { IEarningsPool } from "../_interfaces/vaults/IEarningsPool.sol";

contract Object is UUPSUpgradeable, ERC721EnumerableUpgradeable {
    /*
     @Libraries
    */
    using SafeERC20 for IERC20;

    /*
     @Constants
    */
    uint256 public constant PAY_TOKENS_LIMIT = 20;

    /*
     @Common
    */
    IAddressBook public addressBook;
    uint256 public maxShares;
    uint256 public mintedShares;
    uint256 public nextTokenId;
    uint256 public currentPriceOneShare;
    uint256 public companyShares;
    uint256 public earnings;
    bool public isSold;

    /*
     @User
    */
    mapping(address account => uint256 oneSharePriceUSD) public userPersonalPrice;

    /*
     @ReferralProgram
    */
    bool public referralProgramEnabled;

    /*
     @Token
    */
    mapping(uint256 tokenId => IERC20 payToken) public tokenBuyFor;
    mapping(uint256 tokenId => uint256 payTokenAmount) public tokenBuyForAmount;
    mapping(uint256 tokenId => uint256 stageId) public tokenStage;
    mapping(uint256 tokenId => uint256 shares) public tokenShares;
    mapping(uint256 tokenId => uint256 buyPriceUSD) public tokenBuyPrice;
    mapping(uint256 tokenId => uint256 withdrawnRewardsUSD) public tokenWithdrawnRewards;
    mapping(uint256 tokenId => mapping(uint256 votingId => bool)) public tokenVoted;

    /*
     @Stage
    */
    uint256 public currentStage;
    mapping(uint256 stageId => mapping(IERC20 payToken => uint256 amount))
        public stagePayTokenAmount;
    mapping(uint256 stageId => uint256 availableShares) public stageAvailableShares;
    mapping(uint256 stageId => uint256 saleStopTimestamp) public stageSaleStopTimestamp;
    mapping(uint256 stageId => mapping(IERC20 payToken => bool exists)) public stagePayTokenExists;
    mapping(uint256 stageId => IERC20[]) public stagePayTokens;
    mapping(uint256 stageId => uint256 earnings) public stageBoostedEarnings;

    /*
     @Voting
    */
    uint256 public currentVotingId;
    mapping(uint256 votignId => uint256 sellPriceUSD) public votingObjectSellPrice;
    mapping(uint256 votignId => uint256 expiredTimestamp) public votingExpiredTimestamp;
    mapping(uint256 votignId => uint256 yesShares) public votingYesShares;
    mapping(uint256 votignId => uint256 noShares) public votingNoShares;

    event Vote(address user, uint256 tokenId, uint256 votingId, bool value);

    function initialize(
        address _addressBook,
        uint256 _maxShares,
        uint256 _initialStageAvailableShares,
        uint256 _initialStageSaleStopTimestamp,
        uint256 _currentPriceOneShare,
        bool _referralProgramEnabled
    ) public initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_currentPriceOneShare != 0, "_currentPriceOneShare is zero!");
        addressBook = IAddressBook(_addressBook);
        referralProgramEnabled = _referralProgramEnabled;
        maxShares = _maxShares;
        currentPriceOneShare = _currentPriceOneShare;

        uint256 _currentStage = 1;
        currentStage = _currentStage;

        stageAvailableShares[_currentStage] = _initialStageAvailableShares;
        stageSaleStopTimestamp[_currentStage] = _initialStageSaleStopTimestamp;
    }

    /*
     @Voting
    */
    function createVoting(uint256 _objectSellPrice, uint256 _expiredTimestamp) public {
        addressBook.accessRoles().requireAdministrator(msg.sender);

        uint256 votingId = ++currentVotingId;
        votingObjectSellPrice[votingId] = _objectSellPrice;
        votingExpiredTimestamp[votingId] = _expiredTimestamp;
    }

    function disableReferralProgram() external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        referralProgramEnabled = false;
    }

    function enableReferralProgram() external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        referralProgramEnabled = true;
    }

    function closeVoting(uint256 _votingId) external virtual {
        require(_votingId == currentVotingId, "can close only current voting!");
        require(votingExpiredTimestamp[_votingId] > block.timestamp, "voting expired!");
        addressBook.accessRoles().requireAdministrator(msg.sender);
        votingExpiredTimestamp[_votingId] = block.timestamp;
    }

    function vote(uint256 _votingId, uint256 _tokenId, bool _value) external {
        addressBook.pause().requireNotPaused();

        require(msg.sender == ownerOf(_tokenId), "only token owner!");
        require(
            _votingId == currentVotingId &&
                block.timestamp < votingExpiredTimestamp[_votingId] &&
                _votingId != 0,
            "voting expired or not exists!"
        );
        require(tokenVoted[_tokenId][_votingId] == false, "token already voted!");
        tokenVoted[_tokenId][_votingId] = true;

        if (_value) {
            votingYesShares[_votingId] += tokenShares[_tokenId];
        } else {
            votingNoShares[_votingId] += tokenShares[_tokenId];
        }

        emit Vote(msg.sender, _tokenId, _votingId, _value);
    }

    /*
     @Stage
    */
    function createNewStage(
        uint256 _shares,
        uint256 _oneSharePrice,
        uint256 _saleStopTimestamp
    ) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);

        require(_shares > 0, "_shares is zero!");
        require(_oneSharePrice > 0, "_oneSharePrice is zero!");
        require(
            _saleStopTimestamp == 0 || _saleStopTimestamp > block.timestamp,
            "_saleStopTimestamp!"
        );

        require(mintedShares + _shares <= maxShares, "maxShares!");
        require(stageAvailableShares[currentStage] == 0, "last stage not closed!");

        uint256 newStageId = ++currentStage;
        stageAvailableShares[newStageId] = _shares;
        stageSaleStopTimestamp[newStageId] = _saleStopTimestamp;

        currentPriceOneShare = _oneSharePrice;
    }

    function setStagePriceOneShare(uint256 _stageId, uint256 _oneSharePrice) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_oneSharePrice > 0, "_oneSharePrice is zero!");
        require(_stageId == currentStage, "can set price only current stage!");
        require(stageAvailableShares[currentStage] > 0, "all stage shares sold!");
        currentPriceOneShare = _oneSharePrice;
    }

    function closeStage(uint256 _stageId) external {
        require(_stageId == currentStage, "stage already closed!");
        // [!] requireOwnersMultisig in buySharesForCompany
        buySharesForCompany(stageAvailableShares[_stageId]);
    }

    function addStageBoostedEarnings(
        uint256[] calldata _stageIds,
        uint256[] calldata _earnings
    ) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_stageIds.length == _earnings.length, "length!");
        for (uint256 i; i < _stageIds.length; ++i) {
            require(_stageIds[i] <= currentStage, "unknow stage!");
            stageBoostedEarnings[_stageIds[i]] += _earnings[i];
        }
    }

    function subStageBoostedEarnings(
        uint256[] calldata _stageIds,
        uint256[] calldata _earnings
    ) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_stageIds.length == _earnings.length, "length!");
        for (uint256 i; i < _stageIds.length; ++i) {
            require(_stageIds[i] <= currentStage, "unknow stage!");
            stageBoostedEarnings[_stageIds[i]] -= _earnings[i];
        }
    }

    function addEarnings(uint256 _amount) public virtual {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(mintedShares > 0, "cant add earnings to empty object!");
        require(isSold == false, "object sold!");
        earnings += _amount;
    }

    function subEarnings(uint256 _amount) public virtual {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        earnings -= _amount;
    }

    function sellObjectAndClose(uint256 _sellPriceUSD) public virtual {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(mintedShares > 0, "cant sell empty object!");
        require(isSold == false, "object already sold!");

        require(_sellPriceUSD > 0, "_sellPriceUSD is zero!");
        earnings += _sellPriceUSD;
        isSold = true;
    }

    function buySharesForCompany(uint256 _maxAvailableShares) public virtual {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_maxAvailableShares > 0, "_maxAvailableShares is zero!");
        require(isSold == false, "object sold!");

        uint256 _currentStage = currentStage;

        uint256 availableShares = stageAvailableShares[_currentStage];
        require(availableShares > 0, "no shares available!");

        uint256 addedShares = availableShares > _maxAvailableShares
            ? _maxAvailableShares
            : availableShares;

        stageAvailableShares[_currentStage] -= addedShares;

        companyShares += addedShares;
        mintedShares += addedShares;

        // final sale
        if (stageAvailableShares[_currentStage] == 0) {
            _sendAllAssetsToTreasury();
        }
    }

    function withdrawCompanyShares(
        uint256 _shares,
        address _recipient,
        uint256 _virtualPrice
    ) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(isSold == false, "object sold!");
        require(_shares <= companyShares, "_shares > companyShares");
        companyShares -= _shares;

        uint256 _currentStage = currentStage;

        /* TODO: check used it?
        // shares
        uint256 newMintedShares = mintedShares + _shares;
        require(newMintedShares <= stageAvailableShares[_currentStage], "maxAvailableShares!");
        mintedShares = newMintedShares;
        */

        // mint token
        uint256 tokenId = ++nextTokenId;
        tokenStage[tokenId] = _currentStage;
        tokenShares[tokenId] = _shares;
        tokenBuyPrice[tokenId] = _virtualPrice;
        _safeMint(_recipient, tokenId);

        // New token without rewards
        _updateWithdrawnRewards(tokenId);
    }

    function closeSale() external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        stageSaleStopTimestamp[currentStage] = block.timestamp;
    }

    function setSaleStopTimestamp(uint256 _stageId, uint256 _saleStopTimestamp) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_stageId == currentStage, "can update only current stage!");
        stageSaleStopTimestamp[_stageId] = _saleStopTimestamp;
    }

    function requireTokenReady(uint256 _tokenId) public view {
        requireStageReady(tokenStage[_tokenId]);
    }

    function requireStageReady(uint256 _stageId) public view {
        require(_stageId > 0 && _stageId <= currentStage, "stage not exists!");
        require(stageAvailableShares[_stageId] == 0, "stage not ready!");
    }

    function isActiveSale() public view returns (bool) {
        uint256 _saleStopTimestamp = stageSaleStopTimestamp[currentStage];
        return _saleStopTimestamp == 0 || block.timestamp < _saleStopTimestamp;
    }

    function _requireActiveSale() internal view {
        require(isActiveSale(), "sale disabled!");
    }

    function estimateBuySharesUSD(
        address _buyer,
        uint256 _sharesAmount
    ) public view returns (uint256) {
        return getPriceForUser(_buyer) * _sharesAmount;
    }

    function estimateBuySharesToken(
        address _buyer,
        uint256 _sharesAmount,
        IERC20 _payToken
    ) public view returns (uint256) {
        uint256 priceUSD = estimateBuySharesUSD(_buyer, _sharesAmount);
        if (priceUSD == 0) return 0;
        return addressBook.pricersManager().usdAmountToToken(priceUSD, _payToken);
    }

    function getPriceForUser(address _user) public view returns (uint256) {
        uint256 _personalPrice = userPersonalPrice[_user];
        uint256 _currentPriceOneShare = currentPriceOneShare;
        if (_personalPrice == 0 || _currentPriceOneShare < _personalPrice) {
            _personalPrice = _currentPriceOneShare;
        }
        return _personalPrice;
    }

    function buyShares(
        uint256 _sharesAmount,
        IERC20 _payToken,
        uint256 _maxPayTokenAmount,
        address _referrer
    ) external {
        addressBook.pause().requireNotPaused();
        _requireActiveSale();
        require(isSold == false, "object sold!");

        userPersonalPrice[msg.sender] = getPriceForUser(msg.sender);

        uint256 _currentStage = currentStage;

        // Pay tokens list
        if (stagePayTokenExists[_currentStage][_payToken] == false) {
            require(stagePayTokens[_currentStage].length < PAY_TOKENS_LIMIT, "PAY_TOKENS_LIMIT!");
            stagePayTokenExists[_currentStage][_payToken] = true;
            stagePayTokens[_currentStage].push(_payToken);
        }

        // pay tokens slippage
        IAddressBook _addressBook = addressBook;
        uint256 _payTokenAmount = estimateBuySharesToken(msg.sender, _sharesAmount, _payToken);
        require(_payTokenAmount > 0, "_payTokenAmount is zero!");
        require(_payTokenAmount <= _maxPayTokenAmount, "_maxPayTokenAmount!");

        // recieve pay tokens
        uint256 balanceBefore = _payToken.balanceOf(address(this));
        _payToken.safeTransferFrom(msg.sender, address(this), _payTokenAmount);
        uint256 balanceAfter = _payToken.balanceOf(address(this));
        require(
            balanceAfter - balanceBefore == _payTokenAmount,
            "transfer fees are not supported!"
        );

        // stage
        stagePayTokenAmount[_currentStage][_payToken] += _payTokenAmount;
        require(stageAvailableShares[_currentStage] >= _sharesAmount, "stageAvailableShares!");
        stageAvailableShares[_currentStage] -= _sharesAmount;
        mintedShares += _sharesAmount;

        // shares
        uint256 _totalSharesPrice = estimateBuySharesUSD(msg.sender, _sharesAmount);

        // mint token
        uint256 tokenId = ++nextTokenId;
        tokenShares[tokenId] = _sharesAmount;
        tokenBuyPrice[tokenId] = _totalSharesPrice;
        tokenStage[tokenId] = _currentStage;
        tokenBuyFor[tokenId] = _payToken;
        tokenBuyForAmount[tokenId] = _payTokenAmount;
        _safeMint(msg.sender, tokenId);

        // New token not has rewards
        _updateWithdrawnRewards(tokenId);

        // referral program
        if (referralProgramEnabled && _referrer != address(0)) {
            _addressBook.referralProgram().registerSell(
                _referrer,
                _currentStage,
                _totalSharesPrice
            );
        }

        // final sale
        if (stageAvailableShares[_currentStage] == 0) {
            _sendAllAssetsToTreasury();
        }
    }

    function _sendAllAssetsToTreasury() internal {
        address treasury = addressBook.treasury();
        uint256 _currentStage = currentStage;
        uint256 length = stagePayTokens[_currentStage].length;
        for (uint256 i; i < length; ++i) {
            IERC20 payToken = stagePayTokens[_currentStage][i];
            payToken.safeTransfer(treasury, stagePayTokenAmount[_currentStage][payToken]);
        }
    }

    function exit(uint256 _tokenId) external {
        addressBook.pause().requireNotPaused();

        require(mintedShares < maxShares, "object ready for earning!");

        uint256 _tokenStage = tokenStage[_tokenId];

        require(
            _tokenStage == currentStage && stageAvailableShares[_tokenStage] > 0,
            "stage closed!"
        );

        uint256 _saleStopTimestamp = stageSaleStopTimestamp[_tokenStage];
        require(
            _saleStopTimestamp != 0 && _saleStopTimestamp <= block.timestamp,
            "cant exit with active sale!"
        );

        require(ownerOf(_tokenId) == msg.sender, "only token owner!");
        _burn(_tokenId);
        tokenBuyFor[_tokenId].safeTransfer(msg.sender, tokenBuyForAmount[_tokenId]);
    }

    // -----------------------
    // --  Sale  -------------
    // -----------------------

    function buyBack(uint256 _tokenId) public {
        IAddressBook _addressBook = addressBook;
        _addressBook.requireBuyBackFund(msg.sender);

        companyShares += tokenShares[_tokenId];
        _burn(_tokenId);
    }

    // -----------------------
    // --  Earning  ----------
    // -----------------------

    function updateWithdrawnRewards(uint256 _tokenId) public returns (uint256 rewardsUSD) {
        addressBook.pause().requireNotPaused();

        addressBook.requireEarningsPool(IEarningsPool(msg.sender));

        rewardsUSD = _updateWithdrawnRewards(_tokenId);
        require(rewardsUSD > 0, "rewardsUSD is zero!");

        if (isSold) {
            _burn(_tokenId);
        }
    }

    function estimateRewardsUSD(uint256 _tokenId) public view returns (uint256) {
        return
            (tokenShares[_tokenId] * (earnings + stageBoostedEarnings[tokenStage[_tokenId]])) /
            maxShares -
            tokenWithdrawnRewards[_tokenId];
    }

    function _updateWithdrawnRewards(uint256 _tokenId) internal returns (uint256 rewardsUSD) {
        rewardsUSD = estimateRewardsUSD(_tokenId);
        tokenWithdrawnRewards[_tokenId] += rewardsUSD;
    }

    function requireTokenOwner(address _account, uint256 _tokenId) public view {
        require(ownerOf(_tokenId) == _account, "only token owner!");
    }

    function splitToken(uint256 _tokenId, uint256 _rightShares) public virtual {
        addressBook.pause().requireNotPaused();

        requireTokenReady(_tokenId);
        requireTokenOwner(msg.sender, _tokenId);

        _burn(_tokenId);

        uint256 _withdrawnRewards = tokenWithdrawnRewards[_tokenId];

        uint256 _shares = tokenShares[_tokenId];
        require(_shares > _rightShares, "_rightShares <= shares!");
        uint256 _leftShares = _shares - _rightShares;

        uint256 ratio = (1e18 * _leftShares) / _shares;
        uint256 leftWithdrawnRewards = (ratio * _withdrawnRewards) / 1e18;

        uint256 votingId = currentVotingId;
        bool _tokenVoted = tokenVoted[_tokenId][votingId];

        uint256 _tokenBuyPrice = tokenBuyPrice[_tokenId];
        uint256 leftBuyPrice = (ratio * _tokenBuyPrice) / 1e18;

        uint256 _tokenStage = tokenStage[_tokenId];

        uint256 leftTokenId = ++nextTokenId;
        tokenShares[leftTokenId] = _leftShares;
        tokenBuyPrice[leftTokenId] = leftBuyPrice;
        tokenWithdrawnRewards[leftTokenId] = leftWithdrawnRewards;
        tokenVoted[leftTokenId][votingId] = _tokenVoted;
        tokenStage[leftTokenId] = _tokenStage;
        _safeMint(msg.sender, leftTokenId);

        uint256 rightTokenId = ++nextTokenId;
        tokenShares[rightTokenId] = _rightShares;
        tokenBuyPrice[rightTokenId] = _tokenBuyPrice - leftBuyPrice;
        tokenWithdrawnRewards[rightTokenId] = _withdrawnRewards - leftWithdrawnRewards;
        tokenVoted[rightTokenId][votingId] = _tokenVoted;
        tokenStage[rightTokenId] = _tokenStage;
        _safeMint(msg.sender, rightTokenId);
    }

    function mergeTokens(uint256 _leftTokenId, uint256 _rightTokenId) public virtual {
        addressBook.pause().requireNotPaused();

        requireTokenReady(_leftTokenId);
        requireTokenReady(_rightTokenId);

        require(
            ownerOf(_leftTokenId) == msg.sender && ownerOf(_rightTokenId) == msg.sender,
            "only tokens owner!"
        );
        _burn(_leftTokenId);
        _burn(_rightTokenId);

        uint256 mergedTokenId = ++nextTokenId;
        tokenShares[mergedTokenId] = tokenShares[_leftTokenId] + tokenShares[_rightTokenId];
        tokenBuyPrice[mergedTokenId] = tokenBuyPrice[_leftTokenId] + tokenBuyPrice[mergedTokenId];
        tokenWithdrawnRewards[mergedTokenId] =
            tokenWithdrawnRewards[_leftTokenId] +
            tokenWithdrawnRewards[_rightTokenId];

        uint256 votingId = currentVotingId;
        tokenVoted[mergedTokenId][votingId] =
            tokenVoted[_leftTokenId][votingId] ||
            tokenVoted[_rightTokenId][votingId];

        tokenStage[mergedTokenId] = tokenStage[_rightTokenId];
        _safeMint(msg.sender, mergedTokenId);
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    constructor() {
        _disableInitializers();
    }
}
