import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  MultisigWallet,
  MultisigWallet__factory,
  Treasury__factory,
  EarningsPool__factory,
  Treasury,
  EarningsPool,
  IERC20__factory,
  ObjectsFactory__factory,
  ObjectsFactory,
  Object__factory,
  PricersManager__factory,
  PricersManager,
  Pause__factory,
  Pause,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`EarningsPool`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let earningsPool: EarningsPool
  let treasury: Treasury
  let pricersManager: PricersManager
  let objectsFactory: ObjectsFactory
  let pause: Pause
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    earningsPool = EarningsPool__factory.connect(
      (await deployments.get('EarningsPool')).address,
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

    pause = Pause__factory.connect((await deployments.get('Pause')).address, ethers.provider)

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
    const mintedAmount = await ERC20Minter.mint(token.address, earningsPool.address, 10000)

    const withdrawAmount = mintedAmount.div(2)

    const treasuryBalanceBefore = await token.balanceOf(treasury.address)

    await earningsPool.connect(administrator).withdrawToTreasury(token.address, withdrawAmount)

    const treasuryBalanceAfter = await token.balanceOf(treasury.address)
    assert(
      treasuryBalanceAfter.eq(treasuryBalanceBefore.add(withdrawAmount)),
      'treasury not recived tokens!',
    )

    await expect(
      earningsPool.connect(user).withdrawToTreasury(token.address, withdrawAmount),
    ).to.be.revertedWith('only administrator!')
  })

  it(`Regular estimateClaimObjectRewardsToken`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, earningsPool.address, 10000)

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

    const earnings = ethers.utils.parseUnits('10000', 18)
    await object
      .connect(ownersMultisigImpersonated)
      .addEarnings(earnings)

    const estimateRewardsUSD = await object.estimateRewardsUSD(objectTokenId)
    const calculatedRewardsUSD = earnings.mul(objectTokenShares).div(await object.maxShares())

    assert(
      estimateRewardsUSD.eq(calculatedRewardsUSD),
      'estimateRewardsUSD != calculatedSharesUSD',
    )
  })

  
  it(`Regular estimateClaimObjectRewardsToken boosted stage`, async () => {
    const boostedEarnings = ethers.utils.parseUnits('100', 18)

    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, earningsPool.address, 10000)

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

    const earnings = ethers.utils.parseUnits('10000', 18)
    await object
      .connect(ownersMultisigImpersonated)
      .addEarnings(earnings)

      
    await object.connect(ownersMultisigImpersonated).addStageBoostedEarnings([1], [boostedEarnings])

    const estimateRewardsUSD = await object.estimateRewardsUSD(objectTokenId)
    const calculatedRewardsUSD = (earnings.add(boostedEarnings)).mul(objectTokenShares).div(await object.maxShares())

    assert(
      estimateRewardsUSD.eq(calculatedRewardsUSD),
      'estimateRewardsUSD != calculatedSharesUSD',
    )
  })

  it(`claimObjectRewards`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, earningsPool.address, 10000)

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

    await expect(
      earningsPool
        .connect(user)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('not has rewards!')

    await object
      .connect(ownersMultisigImpersonated)
      .addEarnings(ethers.utils.parseUnits('10000', 18))

    await expect(
      earningsPool
        .connect(administrator)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('only token owner!')

    await pause.connect(administrator).pause()

    await expect(
      earningsPool
        .connect(user)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('paused!')

    await pause.connect(ownersMultisigImpersonated).unpause()

    const estimatedClaimObjectRewardsToken = await earningsPool.estimateClaimObjectRewardsToken(
      object.address,
      objectTokenId,
      token.address,
    )

    const userBalanceBefore = await token.balanceOf(user.address)
    await earningsPool
      .connect(user)
      .claimObjectRewards(object.address, objectTokenId, token.address, 0)
    const userBalanceAfter = await token.balanceOf(user.address)

    assert(
      userBalanceAfter.eq(userBalanceBefore.add(estimatedClaimObjectRewardsToken)),
      'user not recived pay tokens!',
    )

    await object
      .connect(ownersMultisigImpersonated)
      .sellObjectAndClose(ethers.utils.parseUnits('1000', 18))

    const estimatedClaimObjectRewardsToken2 = await earningsPool.estimateClaimObjectRewardsToken(
      object.address,
      objectTokenId,
      token.address,
    )

    const userBalanceBefore2 = await token.balanceOf(user.address)
    await earningsPool
      .connect(user)
      .claimObjectRewards(object.address, objectTokenId, token.address, 0)
    const userBalanceAfter2 = await token.balanceOf(user.address)

    await expect(object.ownerOf(objectTokenId)).to.be.revertedWith('ERC721: invalid token ID')
    assert(
      userBalanceAfter2.eq(userBalanceBefore2.add(estimatedClaimObjectRewardsToken2)),
      'user not recived pay tokens2!',
    )
  })


  it(`claimObjectRewards with boosted stage`, async () => {
    const boostedEarnings = ethers.utils.parseUnits('100', 18)

    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, earningsPool.address, 10000)

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

    await expect(
      earningsPool
        .connect(user)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('not has rewards!')

    await object
      .connect(ownersMultisigImpersonated)
      .addEarnings(ethers.utils.parseUnits('10000', 18))

    await object.connect(ownersMultisigImpersonated).addStageBoostedEarnings([1], [boostedEarnings])

    await expect(
      earningsPool
        .connect(administrator)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('only token owner!')

    await pause.connect(administrator).pause()

    await expect(
      earningsPool
        .connect(user)
        .claimObjectRewards(object.address, objectTokenId, token.address, 0),
    ).to.be.revertedWith('paused!')

    await pause.connect(ownersMultisigImpersonated).unpause()

    const estimatedClaimObjectRewardsToken = await earningsPool.estimateClaimObjectRewardsToken(
      object.address,
      objectTokenId,
      token.address,
    )

    const userBalanceBefore = await token.balanceOf(user.address)
    await earningsPool
      .connect(user)
      .claimObjectRewards(object.address, objectTokenId, token.address, 0)
    const userBalanceAfter = await token.balanceOf(user.address)

    assert(
      userBalanceAfter.eq(userBalanceBefore.add(estimatedClaimObjectRewardsToken)),
      'user not recived pay tokens!',
    )

    await object
      .connect(ownersMultisigImpersonated)
      .sellObjectAndClose(ethers.utils.parseUnits('1000', 18))

    const estimatedClaimObjectRewardsToken2 = await earningsPool.estimateClaimObjectRewardsToken(
      object.address,
      objectTokenId,
      token.address,
    )

    const userBalanceBefore2 = await token.balanceOf(user.address)
    await earningsPool
      .connect(user)
      .claimObjectRewards(object.address, objectTokenId, token.address, 0)
    const userBalanceAfter2 = await token.balanceOf(user.address)

    await expect(object.ownerOf(objectTokenId)).to.be.revertedWith('ERC721: invalid token ID')
    assert(
      userBalanceAfter2.eq(userBalanceBefore2.add(estimatedClaimObjectRewardsToken2)),
      'user not recived pay tokens2!',
    )
  })

  it('Regular: Upgarde only deployer', async () => {
    const earningsPoolFactory = await ethers.getContractFactory('EarningsPool')
    const newEarningsPool = await earningsPoolFactory.deploy()

    await earningsPool.connect(ownersMultisigImpersonated).upgradeTo(newEarningsPool.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      earningsPool.address,
    )
    assert(
      implementationAddress == newEarningsPool.address,
      `implementationAddress != newEarningsPool.address. ${implementationAddress} != ${newEarningsPool.address}`,
    )
  })

  it('Error unit: Upgarde not owner', async () => {
    const users: Record<string, SignerWithAddress> = {
      user: user,
      administrator: administrator,
    }
    for (const name of Object.keys(users)) {
      console.log(`caller: ${name}`)
      const signer = users[name]
      await expect(
        earningsPool.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
