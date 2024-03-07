import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  MultisigWallet,
  MultisigWallet__factory,
  Treasury__factory,
  BuyBackFund__factory,
  Treasury,
  BuyBackFund,
  IERC20__factory,
  ObjectsFactory__factory,
  ObjectsFactory,
  Object__factory,
  PricersManager__factory,
  PricersManager,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'

describe(`BuyBackFund`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let buyBackFund: BuyBackFund
  let treasury: Treasury
  let pricersManager: PricersManager
  let objectsFactory: ObjectsFactory
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    buyBackFund = BuyBackFund__factory.connect(
      (await deployments.get('BuyBackFund')).address,
      ethers.provider,
    )

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )

    objectsFactory = ObjectsFactory__factory.connect(
      (await deployments.get('ObjectsFactory')).address,
      ethers.provider,
    )

    pricersManager = PricersManager__factory.connect(
      (await deployments.get('PricersManager')).address,
      ethers.provider,
    )

    const OwnersMultisigDeployment = await deployments.get('OwnersMultisig')
    ownersMultisig = MultisigWallet__factory.connect(
      OwnersMultisigDeployment.address,
      ethers.provider,
    )
    await helpers.impersonateAccount(ownersMultisig.address)
    ownersMultisigImpersonated = await ethers.getSigner(ownersMultisig.address)
    await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))

    const accounts = await ethers.getSigners()
    user = accounts[1]

    const administratorAddress = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
    await helpers.impersonateAccount(administratorAddress)
    administrator = await ethers.getSigner(administratorAddress)
    await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it(`withdrawToTreasury`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    const mintedAmount = await ERC20Minter.mint(token.address, buyBackFund.address, 10000)

    const withdrawAmount = mintedAmount.div(2)

    const treasuryBalanceBefore = await token.balanceOf(treasury.address)

    await buyBackFund.connect(administrator).withdrawToTreasury(token.address, withdrawAmount)

    const treasuryBalanceAfter = await token.balanceOf(treasury.address)
    assert(
      treasuryBalanceAfter.eq(treasuryBalanceBefore.add(withdrawAmount)),
      'treasury not recived tokens!',
    )

    await expect(
      buyBackFund.connect(user).withdrawToTreasury(token.address, withdrawAmount),
    ).to.be.revertedWith('only administrator!')
  })

  it(`sellBack`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, buyBackFund.address, 10000)

    const objectId = 1
    const objectAddress = await objectsFactory.objectAddress(objectId)
    await objectsFactory
      .connect(ownersMultisigImpersonated)
      .createFullSaleObject(100, 0, ethers.utils.parseUnits('100', 18), true)

    const object = Object__factory.connect(objectAddress, ethers.provider)

    const objectTokenId = 1
    const objectTokenShares = 10
    await token.connect(user).approve(object.address, ethers.constants.MaxUint256)
    await object
      .connect(user)
      .buyShares(
        objectTokenShares,
        token.address,
        ethers.constants.MaxUint256,
        ethers.constants.AddressZero,
      )

    await object.connect(ownersMultisigImpersonated).closeStage(1)

    await buyBackFund
      .connect(ownersMultisigImpersonated)
      .setBuyBackOneSharePrice(object.address, ethers.utils.parseUnits('110', 18))

    const estimatedSellTokens = await buyBackFund.estimateSellBackToken(
      object.address,
      objectTokenId,
      token.address,
    )

    const userBalanceBeforeBefore = await token.balanceOf(user.address)
    const companySharesBefore = await object.companyShares()
    await buyBackFund.connect(user).sellBack(object.address, objectTokenId, token.address, 0)
    const userBalanceAfter = await token.balanceOf(user.address)
    const companySharesAfter = await object.companyShares()

    assert(
      userBalanceAfter.eq(userBalanceBeforeBefore.add(estimatedSellTokens)),
      'user not recived pay tokens!',
    )
    assert(
      companySharesAfter.eq(companySharesBefore.add(estimatedSellTokens)),
      'company not recived shares!',
    )
  })
})
