import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  MultisigWallet,
  MultisigWallet__factory,
  Treasury__factory,
  ReferralProgram__factory,
  Treasury,
  ReferralProgram,
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

describe(`ReferralProgram`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let referrer: SignerWithAddress
  let referrer2: SignerWithAddress
  let referralProgram: ReferralProgram
  let treasury: Treasury
  let pricersManager: PricersManager
  let objectsFactory: ObjectsFactory
  let pause: Pause
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    referralProgram = ReferralProgram__factory.connect(
      (await deployments.get('ReferralProgram')).address,
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
    referrer = accounts[8]
    referrer2 = accounts[7]

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
    const mintedAmount = await ERC20Minter.mint(token.address, referralProgram.address, 10000)

    const withdrawAmount = mintedAmount.div(2)

    const treasuryBalanceBefore = await token.balanceOf(treasury.address)

    await referralProgram.connect(administrator).withdrawToTreasury(token.address, withdrawAmount)

    const treasuryBalanceAfter = await token.balanceOf(treasury.address)
    assert(
      treasuryBalanceAfter.eq(treasuryBalanceBefore.add(withdrawAmount)),
      'treasury not recived tokens!',
    )

    await expect(
      referralProgram.connect(user).withdrawToTreasury(token.address, withdrawAmount),
    ).to.be.revertedWith('only administrator!')
  })

  it(`claimObjectRewards`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, user.address, 10000)
    await ERC20Minter.mint(token.address, referralProgram.address, 10000)

    const objectId = 1
    const stageId = 1
    const objectAddress = await objectsFactory.objectAddress(objectId)
    const oneSharePrice = ethers.utils.parseUnits('100', 18)
    await objectsFactory
      .connect(ownersMultisigImpersonated)
      .createFullSaleObject(100, 0, oneSharePrice, true)

    const object = Object__factory.connect(objectAddress, ethers.provider)

    const referrerRewardsBefore = await referralProgram.rewards(
      referrer.address,
      object.address,
      stageId,
    )

    const objectTokenId = 1
    const objectTokenShares = 10
    await token.connect(user).approve(object.address, ethers.constants.MaxUint256)
    await object
      .connect(user)
      .buyShares(objectTokenShares, token.address, ethers.constants.MaxUint256, referrer.address)

    const referrerRewardsAfter = await referralProgram.rewards(
      referrer.address,
      object.address,
      stageId,
    )

    const rewardsRatio = await referralProgram.rewarsRatio()

    const calculatedClaimUSD = oneSharePrice.mul(objectTokenShares).mul(rewardsRatio).div(10000)
    const estimateClaimUSD = await referralProgram.estimateClaimUSD(
      referrer.address,
      object.address,
      stageId,
    )

    assert(calculatedClaimUSD.eq(estimateClaimUSD), 'calculatedClaimUSD != estimateClaimUSD')
    assert(
      referrerRewardsAfter.eq(referrerRewardsBefore.add(estimateClaimUSD)),
      'rewards not recived!',
    )

    const estimatedClaimToken = await referralProgram.estimateClaimToken(
      referrer.address,
      object.address,
      stageId,
      token.address,
    )
    const calculatedClaimToken = await pricersManager.usdAmountToToken(
      oneSharePrice.mul(objectTokenShares).mul(rewardsRatio).div(10000),
      token.address,
    )
    assert(
      calculatedClaimToken.eq(estimatedClaimToken),
      `calculatedClaimToken != estimatedClaimToken | ${calculatedClaimToken} != ${estimatedClaimToken}`,
    )

    expect(
      referralProgram.connect(referrer).claim(object.address, 0, token.address, 0),
    ).to.be.revertedWith('stage not exists!')
    expect(
      referralProgram.connect(referrer).claim(object.address, 100, token.address, 0),
    ).to.be.revertedWith('stage not exists!')
    expect(
      referralProgram.connect(referrer).claim(object.address, stageId, token.address, 0),
    ).to.be.revertedWith('stage not ready!')

    await object.connect(ownersMultisigImpersonated).closeStage(stageId)

    const referrerBalanceBefore = await token.balanceOf(referrer.address)
    await referralProgram.connect(referrer).claim(object.address, stageId, token.address, 0)
    const referrerBalanceAfter = await token.balanceOf(referrer.address)
    assert(
      referrerBalanceAfter.eq(referrerBalanceBefore.add(estimatedClaimToken)),
      'referrer not recived rewards!',
    )

    await expect(
      referralProgram.connect(referrer).claim(object.address, stageId, token.address, 0),
    ).to.be.revertedWith('rewards is zero!')
  })

  it('Regular: Upgarde only deployer', async () => {
    const referralProgramFactory = await ethers.getContractFactory('ReferralProgram')
    const newReferralProgram = await referralProgramFactory.deploy()

    await referralProgram.connect(ownersMultisigImpersonated).upgradeTo(newReferralProgram.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      referralProgram.address,
    )
    assert(
      implementationAddress == newReferralProgram.address,
      `implementationAddress != newReferralProgram.address. ${implementationAddress} != ${newReferralProgram.address}`,
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
        referralProgram.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
