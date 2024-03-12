import { deployments, ethers } from 'hardhat'
import { expect, assert } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import {
  MultisigWallet,
  MultisigWallet__factory,
  ObjectsFactory__factory,
  ObjectsFactory,
  IERC20__factory,
  Object__factory,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'

describe(`ObjectsFactory`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let objectsFactory: ObjectsFactory
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    objectsFactory = ObjectsFactory__factory.connect(
      (await deployments.get('ObjectsFactory')).address,
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

  it(`create full sale object`, async () => {
    const objectId = 1
    const objectAddress = await objectsFactory.objectAddress(objectId)
    const stageId = 1
    const maxShares = 100
    const saleStopTimestamp = 0
    const priceOneShare = ethers.utils.parseUnits('100', 18)
    const referralProgramEnabled = true
    
    await expect(
      objectsFactory
        .connect(user)
        .createFullSaleObject(
          maxShares,
          saleStopTimestamp,
          priceOneShare,
          referralProgramEnabled,
        ),
    ).to.be.revertedWith('only owners multisig!')

    await objectsFactory
      .connect(ownersMultisigImpersonated)
      .createFullSaleObject(maxShares, saleStopTimestamp, priceOneShare, referralProgramEnabled)

    const object = Object__factory.connect(objectAddress, ethers.provider)

    assert((await object.maxShares()).eq(maxShares), 'initial maxShares!')
    assert(
      (await object.stageAvailableShares(stageId)).eq(maxShares),
      'initial stageAvailableShares!',
    )
    assert(
      (await object.stageSaleStopTimestamp(stageId)).eq(saleStopTimestamp),
      'initial saleStopTimestamp!',
    )
    assert((await object.currentPriceOneShare()).eq(priceOneShare), 'initial priceOneShare!')
    assert(
      (await object.referralProgramEnabled()) == referralProgramEnabled,
      'initial referralProgramEnabled!',
    )
  })

  it(`create stage sale object`, async () => {
    const objectId = 1
    const objectAddress = await objectsFactory.objectAddress(objectId)
    const stageId = 1
    const maxShares = 100
    const intialStageAvailableShares = 10
    const intialStageSaleStopTimestamp = 0
    const priceOneShare = ethers.utils.parseUnits('100', 18)
    const referralProgramEnabled = true

    await expect(
      objectsFactory
        .connect(administrator)
        .createStageSaleObject(
          maxShares,
          intialStageAvailableShares,
          intialStageSaleStopTimestamp,
          priceOneShare,
          referralProgramEnabled,
        ),
    ).to.be.revertedWith('only owners multisig!')

    await objectsFactory
      .connect(ownersMultisigImpersonated)
      .createStageSaleObject(
        maxShares,
        intialStageAvailableShares,
        intialStageSaleStopTimestamp,
        priceOneShare,
        referralProgramEnabled,
      )

    const object = Object__factory.connect(objectAddress, ethers.provider)

    assert((await object.maxShares()).eq(maxShares), 'initial maxShares!')
    assert(
      (await object.stageAvailableShares(stageId)).eq(intialStageAvailableShares),
      'initial intialStageAvailableShares!',
    )
    assert(
      (await object.stageSaleStopTimestamp(stageId)).eq(intialStageSaleStopTimestamp),
      'initial saleStopTimestamp!',
    )
    assert((await object.currentPriceOneShare()).eq(priceOneShare), 'initial priceOneShare!')
    assert(
      (await object.referralProgramEnabled()) == referralProgramEnabled,
      'initial referralProgramEnabled!',
    )
  })

  it('Regular: Upgarde only deployer', async () => {
    const objectsFactoryFactory = await ethers.getContractFactory('ObjectsFactory')
    const newObjectsFactory = await objectsFactoryFactory.deploy()

    await objectsFactory.connect(ownersMultisigImpersonated).upgradeTo(newObjectsFactory.address)
    const implementationAddress = await getImplementationAddress(
      ethers.provider,
      objectsFactory.address,
    )
    assert(
      implementationAddress == newObjectsFactory.address,
      `implementationAddress != newObjectsFactory.address. ${implementationAddress} != ${newObjectsFactory.address}`,
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
        objectsFactory.connect(signer).upgradeTo(ethers.constants.AddressZero),
      ).to.be.revertedWith('only owners multisig!')
    }
  })
})
