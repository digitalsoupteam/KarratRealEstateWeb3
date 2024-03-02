import { deployments, ethers } from 'hardhat'
import { expect } from 'chai'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { AddressBook, AddressBook__factory } from '../typechain-types'


describe(`AddressBook`, () => {
  let productOwner: SignerWithAddress
  let user: SignerWithAddress
  let addressBook: AddressBook
  let initSnapshot: string

  before(async () => {
    const accounts = await ethers.getSigners()
    productOwner = accounts[0]
    user = accounts[9]

    await deployments.fixture()
    const AddressBookDeployment = await deployments.get('AddressBook')
    addressBook = AddressBook__factory.connect(AddressBookDeployment.address, productOwner)

    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [initSnapshot])
    initSnapshot = await ethers.provider.send('evm_snapshot', [])
  })

  it(`Error: addNewNftTokenContract not owner`, async () => {
    const nft = ethers.constants.AddressZero
    await expect(
      addressBook.connect(user).addNewNftTokenContract(nft),
    ).to.be.revertedWith('only product owner!')
  })

  it(`Error: disableNftTokenContract not owner`, async () => {
    const nft = ethers.constants.AddressZero
    await expect(
      addressBook.connect(user).disableNftTokenContract(nft),
    ).to.be.revertedWith('only product owner!')
  })

  it(`Error: pause not owner`, async () => {
    await expect(
      addressBook.connect(user).pause(),
    ).to.be.revertedWith('only product owner!')
  })

  it(`Error: unpause not owner`, async () => {
    await expect(
      addressBook.connect(user).unpause(),
    ).to.be.revertedWith('only product owner!')
  })

  it(`Error: second call setNftFactory`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setNftFactory(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setCreditPool`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setCreditPool(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setSignatureVerifier`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setSignatureVerifier(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setNftObserver`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setNftObserver(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setTreasury`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setTreasury(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setMarketplace`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setMarketplace(nftFactory),
    ).to.be.revertedWith('already setted!')
  })

  it(`Error: second call setCreditPool`, async () => {
    const nftFactory = ethers.constants.AddressZero
    await expect(
      addressBook.connect(productOwner).setCreditPool(nftFactory),
    ).to.be.revertedWith('already setted!')
  })
})
