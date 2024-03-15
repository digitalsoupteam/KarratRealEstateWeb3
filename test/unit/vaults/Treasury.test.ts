import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  MultisigWallet,
  MultisigWallet__factory,
  Treasury__factory,
  Treasury,
  IERC20__factory,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`Treasury`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let treasury: Treasury
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

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

  it(`withdraw`, async () => {
    const token = IERC20__factory.connect(USDT, ethers.provider)
    const mintedAmount = await ERC20Minter.mint(token.address, treasury.address, 10000)

    const withdrawAmount = mintedAmount.div(2)

    const recipient = ownersMultisigImpersonated.address
    const recipientBalanceBefore = await token.balanceOf(recipient)

    await treasury.connect(ownersMultisigImpersonated).withdraw(token.address, withdrawAmount, recipient)

    const recipientBalanceAfter = await token.balanceOf(recipient)
    assert(
      recipientBalanceAfter.eq(recipientBalanceBefore.add(withdrawAmount)),
      'recipient not recived tokens!',
    )

    await expect(
      treasury.connect(user).withdraw(token.address, withdrawAmount, ownersMultisigImpersonated.address),
    ).to.be.revertedWith('only owners multisig!')
  })

  it('Regular: Upgarde only deployer', async () => {
    const treasuryFactory = await ethers.getContractFactory('Treasury')
    const newTreasury = await treasuryFactory.deploy()

    await treasury.connect(ownersMultisigImpersonated).upgradeTo(newTreasury.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      treasury.address,
    )
    assert(
      implementationAddress == newTreasury.address,
      `implementationAddress != newTreasury.address. ${implementationAddress} != ${newTreasury.address}`,
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
        treasury.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
