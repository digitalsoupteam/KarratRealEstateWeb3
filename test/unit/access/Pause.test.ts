import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  Pause,
  Pause__factory,
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

describe(`Pause`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let owners: SignerWithAddress[]
  let addressBook: AddressBook
  let pause: Pause
  let objectsFactory: ObjectsFactory
  let referralProgram: ReferralProgram
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    const AddressBookDeployment = await deployments.get('AddressBook')
    addressBook = AddressBook__factory.connect(AddressBookDeployment.address, ethers.provider)

    console.log(`--- Initial data ---`)
    console.log(`AddressBook: ${addressBook.address}`)

    const PauseDeployment = await deployments.get('Pause')
    pause = Pause__factory.connect(PauseDeployment.address, ethers.provider)
    assert(pause.address == (await addressBook.pause()), 'pause address not equal!')
    console.log(`Pause: ${pause.address}`)

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

    const OwnersMultisigDeployment = await deployments.get('OwnersMultisig')
    ownersMultisig = MultisigWallet__factory.connect(
      OwnersMultisigDeployment.address,
      ethers.provider,
    )
    await helpers.impersonateAccount(ownersMultisig.address)
    ownersMultisigImpersonated = await ethers.getSigner(ownersMultisig.address)
    await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))

    const ownersAddresses = [
      '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
      '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    ]
    owners = []
    for (const owner of ownersAddresses) {
      assert(await ownersMultisig.signers(owner), 'initial owner!')
      await helpers.impersonateAccount(owner)
      await helpers.setBalance(owner, ethers.utils.parseEther('100'))
      owners.push(await ethers.getSigner(owner))
    }

    const accounts = await ethers.getSigners()
    user = accounts[6]

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

  it(`Regular: pause admin`, async () => {
    await pause.connect(administrator).pause()
    assert(await pause.enabled(), 'pause not enabled!')
  })

  it(`Regular: pause owner`, async () => {
    await pause.connect(owners[0]).pause()
    assert(await pause.enabled(), 'pause not enabled!')
  })
  
  it(`Error: pause user`, async () => {
    await expect(pause.connect(user).pause()).to.be.revertedWith('only administrator!')
  })

  it(`Regular: unpause ownersMultisig`, async () => {
    await pause.connect(ownersMultisigImpersonated).unpause()
    assert((await pause.enabled()) == false, 'pause not disabled!')
  })

  it(`Error: unpause administrator`, async () => {
    await expect(pause.connect(administrator).unpause()).to.be.revertedWith('only owners multisig!')
  })

  it(`Error: unpause user`, async () => {
    await expect(pause.connect(user).unpause()).to.be.revertedWith('only owners multisig!')
  })

  it(`Regular: pauseContract admin`, async () => {
    await pause.connect(administrator).pauseContract(objectsFactory.address)
    assert(await pause.pausedContracts(objectsFactory.address), 'pause not enabled!')
  })

  it(`Regular: pause owner`, async () => {
    await pause.connect(owners[0]).pauseContract(objectsFactory.address)
    assert(await pause.pausedContracts(objectsFactory.address), 'pause not enabled!')
  })

  it(`Error: pause user`, async () => {
    await expect(pause.connect(user).pauseContract(objectsFactory.address)).to.be.revertedWith(
      'only administrator!',
    )
  })

  it(`Regular: unpause ownersMultisig`, async () => {
    await pause.connect(ownersMultisigImpersonated).unpuaseContract(objectsFactory.address)
    assert((await pause.pausedContracts(objectsFactory.address)) == false, 'pause not disabled!')
  })

  it(`Error: unpause administrator`, async () => {
    await expect(
      pause.connect(administrator).unpuaseContract(objectsFactory.address),
    ).to.be.revertedWith('only owners multisig!')
  })

  it(`Error: unpause user`, async () => {
    await expect(pause.connect(user).unpuaseContract(objectsFactory.address)).to.be.revertedWith(
      'only owners multisig!',
    )
  })

  it('Regular: Upgarde only deployer', async () => {
    const pauseFactory = await ethers.getContractFactory('Pause')
    const newPause = await pauseFactory.deploy()

    await pause.connect(ownersMultisigImpersonated).upgradeTo(newPause.address)
    const implementationAddress = await getImplementationAddress(ethers.provider, pause.address)
    assert(
      implementationAddress == newPause.address,
      `implementationAddress != newPause.address. ${implementationAddress} != ${newPause.address}`,
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
        pause.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
