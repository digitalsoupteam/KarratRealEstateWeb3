import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  AccessRoles,
  AccessRoles__factory,
  AddressBook,
  AddressBook__factory,
  MultisigWallet,
  MultisigWallet__factory,
  ObjectsFactory,
  ObjectsFactory__factory,
  ReferralProgram__factory,
  ReferralProgram,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`AccessRoles`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let referrer: SignerWithAddress
  let referrer2: SignerWithAddress
  let addressBook: AddressBook
  let accessRoles: AccessRoles
  let objectsFactory: ObjectsFactory
  let referralProgram: ReferralProgram
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    const AddressBookDeployment = await deployments.get('AddressBook')
    addressBook = AddressBook__factory.connect(AddressBookDeployment.address, ethers.provider)

    console.log(`--- Initial data ---`)
    console.log(`AddressBook: ${addressBook.address}`)

    const AccessRolesDeployment = await deployments.get('AccessRoles')
    accessRoles = AccessRoles__factory.connect(AccessRolesDeployment.address, ethers.provider)
    assert(
      accessRoles.address == (await addressBook.accessRoles()),
      'accessRoles address not equal!',
    )
    console.log(`AccessRoles: ${accessRoles.address}`)

    const ReferralProgramDeployment = await deployments.get('ReferralProgram')
    referralProgram = ReferralProgram__factory.connect(
      ReferralProgramDeployment.address,
      ethers.provider,
    )
    assert(
      referralProgram.address == (await addressBook.referralProgram()),
      'referralProgram address not equal!',
    )
    console.log(`ReferralProgram: ${referralProgram.address}`)

    const ObjectsFactoryDeployment = await deployments.get('ObjectsFactory')
    objectsFactory = ObjectsFactory__factory.connect(
      ObjectsFactoryDeployment.address,
      ethers.provider,
    )
    assert(
      objectsFactory.address == (await addressBook.objectsFactory()),
      'objectsFactory address not equal!',
    )
    console.log(`ObjectsFactory: ${objectsFactory.address}`)

    const OwnersMultisigDeployment = await deployments.get('OwnersMultisig')
    ownersMultisig = MultisigWallet__factory.connect(
      OwnersMultisigDeployment.address,
      ethers.provider,
    )
    assert(
      ownersMultisig.address == (await accessRoles.ownersMultisig()),
      'ownersMultisig address not equal!',
    )
    console.log(`OwnersMultisig: ${ownersMultisig.address}`)

    await helpers.impersonateAccount(ownersMultisig.address)
    ownersMultisigImpersonated = await ethers.getSigner(ownersMultisig.address)
    await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))

    const accounts = await ethers.getSigners()
    user = accounts[1]
    referrer = accounts[8]
    referrer2 = accounts[7]

    console.log(`user: ${user.address}`)
    console.log(`referrer: ${referrer.address}`)
    console.log(`referrer2: ${referrer2.address}`)

    const administratorAddress = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
    await helpers.impersonateAccount(administratorAddress)
    administrator = await ethers.getSigner(administratorAddress)
    await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))
    assert(
      await accessRoles.administrators(administrator.address),
      'administrators address not found!',
    )
    console.log(`administrator: ${administrator.address}`)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    console.log('--- End test ---')
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it(`Initail data: ownersMultisig`, async () => {
    assert(
      ownersMultisig.address == (await accessRoles.ownersMultisig()),
      'ownersMultisig not equal!',
    )
  })

  it(`Initail data: administrators`, async () => {
    assert(await accessRoles.administrators(administrator.address), 'administrator not found!')
  })

  it(`Initail data: deployer`, async () => {
    assert(ethers.constants.AddressZero == (await accessRoles.deployer()), 'deployer not removed!')
  })

  it(`Regular: setOwnersMultisig`, async () => {
    const multisigWalletFactory = await ethers.getContractFactory('MultisigWallet')
    const newMultisigWallet = await multisigWalletFactory.deploy()
    await accessRoles
      .connect(ownersMultisigImpersonated)
      .setOwnersMultisig(newMultisigWallet.address)
    assert(
      newMultisigWallet.address == (await accessRoles.ownersMultisig()),
      'ownersMultisig not updated!',
    )
  })

  it(`Error: setOwnersMultisig not supported interface`, async () => {
    await expect(
      accessRoles
        .connect(ownersMultisigImpersonated)
        .setOwnersMultisig(user.address),
    ).to.be.revertedWith('not supported multisig wallet!')
  })

  it(`Error: not owner setOwnersMultisig`, async () => {
    const users: Record<string, SignerWithAddress> = {
      user: user,
      administrator: administrator,
    }
    for (const name of Object.keys(users)) {
      console.log(`caller: ${name}`)
      const signer = users[name]

      const multisigWalletFactory = await ethers.getContractFactory('MultisigWallet')
      const newMultisigWallet = await multisigWalletFactory.deploy()
      await expect(
        accessRoles.connect(signer).setOwnersMultisig(newMultisigWallet.address),
      ).to.be.revertedWith('only owners multisig!')
    }
  })

  it(`Regular: setDeployer`, async () => {
    await accessRoles.connect(ownersMultisigImpersonated).setDeployer(user.address)
    assert(user.address == (await accessRoles.deployer()), 'deployer not setted!')
    await accessRoles.connect(ownersMultisigImpersonated).setDeployer(ethers.constants.AddressZero)
    assert(ethers.constants.AddressZero == (await accessRoles.deployer()), 'deployer not removed!')
  })

  it(`Error: not owner setDeployer`, async () => {
    const users: Record<string, SignerWithAddress> = {
      user: user,
      administrator: administrator,
    }
    for (const name of Object.keys(users)) {
      console.log(`caller: ${name}`)
      const signer = users[name]

      await expect(accessRoles.connect(signer).setDeployer(signer.address)).to.be.revertedWith(
        'only owners multisig!',
      )
    }
  })

  it(`Regular: setAdministrator`, async () => {
    await accessRoles.connect(ownersMultisigImpersonated).setAdministrator(user.address, true)
    assert(await accessRoles.administrators(user.address), 'admin not setted!')
    await accessRoles.connect(ownersMultisigImpersonated).setAdministrator(ethers.constants.AddressZero, false)
    assert(await accessRoles.administrators(user.address), 'admin not removed!')
  })

  it(`Error: not owners setAdministrator`, async () => {
    const users: Record<string, SignerWithAddress> = {
      user: user,
      administrator: administrator,
    }
    for (const name of Object.keys(users)) {
      console.log(`caller: ${name}`)
      const signer = users[name]

      await expect(accessRoles.connect(signer).setAdministrator(user.address, true)).to.be.revertedWith(
        'only owners multisig!',
      )
    }
  })

  it(`Regular: requireDeployer`, async () => {
    await accessRoles.requireDeployer(ethers.constants.AddressZero)
    await expect(accessRoles.requireDeployer(user.address)).to.be.revertedWith('only deployer!');
  })

  it(`Regular: requireAdministrator`, async () => {
    await accessRoles.requireAdministrator(administrator.address)
    await accessRoles.requireAdministrator(await ownersMultisig.owners(0))
    await expect(accessRoles.requireAdministrator(user.address)).to.be.revertedWith('only administrator!');
  })

  it(`Regular: requireOwnersMultisig`, async () => {
    await accessRoles.requireOwnersMultisig(ownersMultisig.address)
    await expect(accessRoles.requireOwnersMultisig(user.address)).to.be.revertedWith('only owners multisig!');
  })

  it('Regular: Upgarde only deployer', async () => {
    const accessRolesFactory = await ethers.getContractFactory('AccessRoles')
    const newAccessRoles = await accessRolesFactory.deploy()

    await accessRoles.connect(ownersMultisigImpersonated).upgradeTo(newAccessRoles.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      accessRoles.address,
    )
    assert(
      implementationAddress == newAccessRoles.address,
      `implementationAddress != newAccessRoles.address. ${implementationAddress} != ${newAccessRoles.address}`,
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
        accessRoles.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
