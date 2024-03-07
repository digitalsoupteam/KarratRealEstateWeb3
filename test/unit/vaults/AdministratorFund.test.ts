import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  AdministratorFund,
  AdministratorFund__factory,
  MultisigWallet,
  MultisigWallet__factory,
  ReferralProgram__factory,
  ReferralProgram,
  Treasury__factory,
  EarningsPool__factory,
  BuyBackFund__factory,
  Treasury,
  EarningsPool,
  BuyBackFund,
  IERC20__factory,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'

describe(`AdministratorFund`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let administratorFund: AdministratorFund
  let earningsPool: EarningsPool
  let buyBackFund: BuyBackFund
  let referralProgram: ReferralProgram
  let treasury: Treasury
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    const AdministratorFundDeployment = await deployments.get('AdministratorFund')
    administratorFund = AdministratorFund__factory.connect(
      AdministratorFundDeployment.address,
      ethers.provider,
    )

    earningsPool = EarningsPool__factory.connect(
      (await deployments.get('EarningsPool')).address,
      ethers.provider,
    )
    assert(
      (await administratorFund.dailyLimit(earningsPool.address)).gt(0),
      'earningsPool not registered recipient!',
    )

    buyBackFund = BuyBackFund__factory.connect(
      (await deployments.get('BuyBackFund')).address,
      ethers.provider,
    )
    assert(
      (await administratorFund.dailyLimit(buyBackFund.address)).gt(0),
      'buyBackFund not registered recipient!',
    )

    referralProgram = ReferralProgram__factory.connect(
      (await deployments.get('ReferralProgram')).address,
      ethers.provider,
    )
    assert(
      (await administratorFund.dailyLimit(referralProgram.address)).gt(0),
      'referralProgram not registered recipient!',
    )

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
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

  it(`setDayliLimit`, async () => {
    const recipient = buyBackFund.address
    const previousLimit = await administratorFund.dailyLimit(recipient)
    const newLimit = previousLimit.add(100)
    await administratorFund.connect(ownersMultisigImpersonated).setDailyLimit(recipient, newLimit)
    assert((await administratorFund.dailyLimit(recipient)).eq(newLimit), 'dailyLimit not updated!')

    await expect(
      administratorFund.connect(user).setDailyLimit(recipient, newLimit),
    ).to.be.revertedWith('only owners multisig!')
  })

  it(`Regular withdrawToTreasury`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    const mintedAmount = await ERC20Minter.mint(token.address, administratorFund.address, 10000)

    const withdrawAmount = mintedAmount.div(2)

    const treasuryBalanceBefore = await token.balanceOf(treasury.address)

    await administratorFund.connect(administrator).withdrawToTreasury(token.address, withdrawAmount)

    const treasuryBalanceAfter = await token.balanceOf(treasury.address)
    assert(
      treasuryBalanceAfter.eq(treasuryBalanceBefore.add(withdrawAmount)),
      'treasury not recived tokens!',
    )
  })

  it(`Error: user withdrawToTreasury`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    const mintedAmount = await ERC20Minter.mint(token.address, administratorFund.address, 10000)
    const withdrawAmount = mintedAmount.div(2)

    await expect(
      administratorFund.connect(user).withdrawToTreasury(token.address, withdrawAmount),
    ).to.be.revertedWith('only administrator!')
  })

  it(`depositTo`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    const mintedAmount = await ERC20Minter.mint(token.address, administratorFund.address, 10000)
    const withdrawAmount = ethers.utils.parseUnits('100', 18)

    const recipient = referralProgram.address
    const recipientBalanceBefore = await token.balanceOf(recipient)
    await administratorFund.connect(administrator).depositTo(recipient, token.address, withdrawAmount)
    const recipientBalanceAfter = await token.balanceOf(recipient)
    assert(recipientBalanceAfter.gt(recipientBalanceBefore), "recipient not recived tokens!")

    await expect(
      administratorFund.connect(user).depositTo(recipient, token.address, withdrawAmount),
    ).to.be.revertedWith('only administrator!')
  })

  it('Regular: Upgarde only deployer', async () => {
    const administratorFundFactory = await ethers.getContractFactory('AdministratorFund')
    const newAdministratorFund = await administratorFundFactory.deploy()

    await administratorFund
      .connect(ownersMultisigImpersonated)
      .upgradeTo(newAdministratorFund.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      administratorFund.address,
    )
    assert(
      implementationAddress == newAdministratorFund.address,
      `implementationAddress != newAdministratorFund.address. ${implementationAddress} != ${newAdministratorFund.address}`,
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
        administratorFund.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
