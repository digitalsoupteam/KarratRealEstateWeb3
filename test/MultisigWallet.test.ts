import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  AccessRoles,
  AddressBook,
  AddressBook__factory,
  MultisigWallet,
  MultisigWallet__factory,
  ObjectsFactory,
  ReferralProgram,
  IERC20Metadata__factory,
  IERC1967__factory,
  UUPSUpgradeable__factory,
} from '../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../constants/addresses'
import ERC20Minter from './utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`MultisigWallet`, () => {
  let ownersMultisig: MultisigWallet
  let owners: SignerWithAddress[]
  let user: SignerWithAddress
  let addressBook: AddressBook
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    const AddressBookDeployment = await deployments.get('AddressBook')
    addressBook = AddressBook__factory.connect(AddressBookDeployment.address, ethers.provider)

    const OwnersMultisigDeployment = await deployments.get('OwnersMultisig')
    ownersMultisig = MultisigWallet__factory.connect(
      OwnersMultisigDeployment.address,
      ethers.provider,
    )
    const ownersAddresses = [
      '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
      '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    ]
    owners = []
    for (const owner of ownersAddresses) {
      await helpers.impersonateAccount(owner)
      await helpers.setBalance(owner, ethers.utils.parseEther('100'))
      owners.push(await ethers.getSigner(owner))
    }

    const accounts = await ethers.getSigners()
    user = accounts[1]

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    console.log('--- End test ---')
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it(`Initail data: owners`, async () => {
    assert((await ownersMultisig.signersCount()).eq(owners.length), 'signersCount not equal!')
    for (const owner of owners) {
      assert(await ownersMultisig.signers(owner.address), 'signer not found!')
    }
  })

  it(`Regular`, async () => {
    const recipient = user.address
    const value = ethers.utils.parseEther('1')

    const recipientBalanceBefore = await ethers.provider.getBalance(recipient)

    const txId = 1
    await ownersMultisig.connect(owners[0]).submitTransaction(recipient, value, '0x', {
      value,
    })

    await ownersMultisig.connect(owners[0]).revokeTransaction(txId)
    assert((await ownersMultisig.txConfirmationsCount(txId)).isZero(), 'not revoked!')

    await expect(ownersMultisig.connect(owners[0]).revokeTransaction(txId)).to.be.revertedWith(
      'not confirmed!',
    )

    await ownersMultisig.connect(owners[1]).acceptTransaction(txId)
    await ownersMultisig.connect(owners[0]).acceptTransaction(txId)

    const recipientBalanceAfter = await ethers.provider.getBalance(recipient)

    assert(
      recipientBalanceAfter.eq(recipientBalanceBefore.add(value)),
      `recipientBalanceAfter.eq(recipientBalanceBefore.add(value)) | ${recipientBalanceAfter}.eq(${recipientBalanceBefore}.add(${value}))`,
    )

    await expect(ownersMultisig.connect(owners[1]).acceptTransaction(txId)).to.be.revertedWith(
      'tx already executed!',
    )

    await expect(ownersMultisig.connect(owners[1]).revokeTransaction(txId)).to.be.revertedWith(
      'tx already executed!',
    )
  })

  it(`Error: not owner submitTransaction`, async () => {
    const recipient = user.address
    const value = ethers.utils.parseEther('1')
    await expect(
      ownersMultisig.connect(user).submitTransaction(recipient, value, '0x', {
        value,
      }),
    ).to.be.revertedWith('only signer!')
  })

  it(`Error: not owner acceptTransaction`, async () => {
    const recipient = user.address
    const value = ethers.utils.parseEther('1')

    const txId = 1
    await ownersMultisig.connect(owners[0]).submitTransaction(recipient, value, '0x', {
      value,
    })

    await expect(ownersMultisig.connect(user).acceptTransaction(txId)).to.be.revertedWith(
      'only signer!',
    )
  })

  it(`Error: acceptTransaction not exists tx`, async () => {
    const txId = 100
    await expect(ownersMultisig.connect(owners[1]).acceptTransaction(txId)).to.be.revertedWith(
      'not found txId!',
    )
  })

  it(`Error: revokeTransaction not exists tx`, async () => {
    const txId = 100
    await expect(ownersMultisig.connect(owners[1]).revokeTransaction(txId)).to.be.revertedWith(
      'not found txId!',
    )
  })

  it(`Regular: withdraw native`, async () => {
    await ERC20Minter.mint(ethers.constants.AddressZero, ownersMultisig.address, 1)
    const value = ethers.utils.parseEther('1')
    const recipeint = user.address
    const data = ownersMultisig.interface.encodeFunctionData('withdraw', [
      recipeint,
      ethers.constants.AddressZero,
      value,
    ])

    const contractBalanceBefore = await ethers.provider.getBalance(ownersMultisig.address)
    const recipientBalanceBefore = await ethers.provider.getBalance(recipeint)

    const txId = 1
    await ownersMultisig.connect(owners[0]).submitTransaction(ownersMultisig.address, 0, data)
    await ownersMultisig.connect(owners[1]).acceptTransaction(txId)

    const contractBalanceAfter = await ethers.provider.getBalance(ownersMultisig.address)
    const recipientBalanceAfter = await ethers.provider.getBalance(recipeint)

    assert(
      contractBalanceAfter.eq(contractBalanceBefore.sub(value)),
      `contractBalanceAfter.eq(contractBalanceBefore.sub(value)) | ${contractBalanceAfter}.eq(${contractBalanceBefore}.sub(${value}))`,
    )
    assert(
      recipientBalanceAfter.eq(recipientBalanceBefore.add(value)),
      `recipientBalanceAfter.eq(recipientBalanceBefore.add(value)) | ${recipientBalanceAfter}.eq(${recipientBalanceBefore}.add(${value}))`,
    )
  })

  it(`Regular: withdraw erc20`, async () => {
    const token = IERC20Metadata__factory.connect(USDT, ethers.provider)
    await ERC20Minter.mint(token.address, ownersMultisig.address, 1000)

    const value = ethers.utils.parseUnits('10', await token.decimals())
    const recipeint = user.address
    const data = ownersMultisig.interface.encodeFunctionData('withdraw', [
      recipeint,
      token.address,
      value,
    ])

    const contractBalanceBefore = await token.balanceOf(ownersMultisig.address)
    const recipientBalanceBefore = await token.balanceOf(recipeint)

    const txId = 1
    await ownersMultisig.connect(owners[0]).submitTransaction(ownersMultisig.address, 0, data)
    await ownersMultisig.connect(owners[1]).acceptTransaction(txId)

    const contractBalanceAfter = await token.balanceOf(ownersMultisig.address)
    const recipientBalanceAfter = await token.balanceOf(recipeint)

    assert(
      contractBalanceAfter.eq(contractBalanceBefore.sub(value)),
      `contractBalanceAfter.eq(contractBalanceBefore.sub(value)) | ${contractBalanceAfter}.eq(${contractBalanceBefore}.sub(${value}))`,
    )
    assert(
      recipientBalanceAfter.eq(recipientBalanceBefore.add(value)),
      `recipientBalanceAfter.eq(recipientBalanceBefore.add(value)) | ${recipientBalanceAfter}.eq(${recipientBalanceBefore}.add(${value}))`,
    )
  })

  it('Regular: Upgarde only self', async () => {
    const multisigWalletFactory = await ethers.getContractFactory('MultisigWallet')
    const newMultisigWallet = await multisigWalletFactory.deploy()

    const data = UUPSUpgradeable__factory.createInterface().encodeFunctionData('upgradeTo', [
      newMultisigWallet.address,
    ])

    const txId = 1
    await ownersMultisig.connect(owners[0]).submitTransaction(ownersMultisig.address, 0, data)
    await ownersMultisig.connect(owners[1]).acceptTransaction(txId)

    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      ownersMultisig.address,
    )
    assert(
      implementationAddress == newMultisigWallet.address,
      `implementationAddress != newMultisigWallet.address. ${implementationAddress} != ${newMultisigWallet.address}`,
    )
  })

  it('Error unit: Upgarde not owner', async () => {
    await expect(
      ownersMultisig.connect(user).upgradeTo(ethers.constants.AddressZero),
    ).to.be.revertedWith('only mutisig!')
  })
})
