import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  AddressBook,
  AddressBook__factory,
  MultisigWallet,
  MultisigWallet__factory,
  ObjectsFactory,
  ObjectsFactory__factory,
  ReferralProgram__factory,
  ReferralProgram,
  AccessRoles__factory,
  Pause__factory,
  Treasury__factory,
  PricersManager__factory,
  EarningsPool__factory,
  AdministratorFund__factory,
  BuyBackFund__factory,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`AddressBook`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let referrer: SignerWithAddress
  let referrer2: SignerWithAddress
  let addressBook: AddressBook
  let objectsFactory: ObjectsFactory
  let referralProgram: ReferralProgram
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    const AddressBookDeployment = await deployments.get('AddressBook')
    addressBook = AddressBook__factory.connect(AddressBookDeployment.address, ethers.provider)

    const accessRoles = AccessRoles__factory.connect(
      (await deployments.get('AccessRoles')).address,
      ethers.provider,
    )
    assert(
      accessRoles.address == (await addressBook.accessRoles()),
      'accessRoles address not equal!',
    )

    const pause = Pause__factory.connect((await deployments.get('Pause')).address, ethers.provider)
    assert(pause.address == (await addressBook.pause()), 'pause address not equal!')

    const treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
      ethers.provider,
    )
    assert(treasury.address == (await addressBook.treasury()), 'treasury address not equal!')

    const pricersManager = PricersManager__factory.connect(
      (await deployments.get('PricersManager')).address,
      ethers.provider,
    )
    assert(
      pricersManager.address == (await addressBook.pricersManager()),
      'pricersManager address not equal!',
    )

    const earningsPool = EarningsPool__factory.connect(
      (await deployments.get('EarningsPool')).address,
      ethers.provider,
    )
    assert(
      earningsPool.address == (await addressBook.earningsPool()),
      'earningsPool address not equal!',
    )

    const administratorFund = AdministratorFund__factory.connect(
      (await deployments.get('AdministratorFund')).address,
      ethers.provider,
    )
    assert(
      administratorFund.address == (await addressBook.administratorFund()),
      'administratorFund address not equal!',
    )

    const buyBackFund = BuyBackFund__factory.connect(
      (await deployments.get('BuyBackFund')).address,
      ethers.provider,
    )
    assert(
      buyBackFund.address == (await addressBook.buyBackFund()),
      'buyBackFund address not equal!',
    )

    const referralProgram = ReferralProgram__factory.connect(
      (await deployments.get('ReferralProgram')).address,
      ethers.provider,
    )
    assert(
      referralProgram.address == (await addressBook.referralProgram()),
      'referralProgram address not equal!',
    )

    const objectsFactory = ObjectsFactory__factory.connect(
      (await deployments.get('ObjectsFactory')).address,
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

  it(`requireBuyBackFund`, async () => {
    await addressBook.requireBuyBackFund(await addressBook.buyBackFund())
    await expect(addressBook.requireBuyBackFund(user.address)).to.be.revertedWith(
      'only buy back fund!',
    )
  })

  it(`requireEarningsPool`, async () => {
    await addressBook.requireEarningsPool(await addressBook.earningsPool())
    await expect(addressBook.requireEarningsPool(user.address)).to.be.revertedWith(
      'only earnings pool!',
    )
  })

  it(`requireObjectsFactory`, async () => {
    await addressBook.requireObjectsFactory(await addressBook.objectsFactory())
    await expect(addressBook.requireObjectsFactory(user.address)).to.be.revertedWith(
      'only objects factory!',
    )
  })

  it(`addObject`, async () => {
    await helpers.impersonateAccount(await addressBook.objectsFactory())
    const objectsFactoryImpersonated = await ethers.getSigner(await addressBook.objectsFactory())
    await helpers.setBalance(objectsFactoryImpersonated.address, ethers.utils.parseEther('100'))

    const fakeObject = await addressBook.earningsPool()
    await addressBook.connect(objectsFactoryImpersonated).addObject(fakeObject)
    await addressBook.requireObject(fakeObject)

    const fakeObject2 = await addressBook.objectsFactory()
    await expect(addressBook.connect(user).addObject(fakeObject2)).to.be.revertedWith(
      'only objects factory!',
    )
  })

  it(`requireObject`, async () => {
    await helpers.impersonateAccount(await addressBook.objectsFactory())
    const objectsFactoryImpersonated = await ethers.getSigner(await addressBook.objectsFactory())
    await helpers.setBalance(objectsFactoryImpersonated.address, ethers.utils.parseEther('100'))

    const fakeObject = await addressBook.earningsPool()
    await addressBook.connect(objectsFactoryImpersonated).addObject(fakeObject)

    await addressBook.requireObject(fakeObject)
    await expect(addressBook.requireObject(user.address)).to.be.revertedWith('only object!')
  })

  it('Regular: Upgarde only deployer', async () => {
    const addressBookFactory = await ethers.getContractFactory('AddressBook')
    const newAddressBook = await addressBookFactory.deploy()

    await addressBook.connect(ownersMultisigImpersonated).upgradeTo(newAddressBook.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      addressBook.address,
    )
    assert(
      implementationAddress == newAddressBook.address,
      `implementationAddress != newAddressBook.address. ${implementationAddress} != ${newAddressBook.address}`,
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
        addressBook.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
