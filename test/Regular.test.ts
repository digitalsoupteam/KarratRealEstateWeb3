// import { deployments, ethers } from 'hardhat'
// import { expect } from 'chai'
// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
// import {
//   AccessRoles,
//   AccessRoles__factory,
//   AddressBook,
//   AddressBook__factory,
//   IMultisigWallet,
//   MultisigWallet,
//   MultisigWallet__factory,
//   ObjectsFactory,
//   ObjectsFactory__factory,
//   Object__factory,
//   IERC20__factory,
//   ReferralProgram__factory,
//   ReferralProgram,
// } from '../typechain-types'
// import * as helpers from '@nomicfoundation/hardhat-network-helpers'
// import { assert } from 'console'
// import { USDC, USDCe, USDT } from '../constants/addresses'
// import ERC20Minter from './utils/ERC20Minter'

// const CASES = {
//   tokens: [
//     {
//       address: USDT,
//       mintAmount: 500000,
//     },
//     // {
//     //   address: USDC,
//     //   mintAmount: 500000,
//     // },
//     // {
//     //   address: USDCe,
//     //   mintAmount: 500000,
//     // },
//   ],
// }

// describe(`RegularTest`, () => {
//   let ownersMultisig: MultisigWallet
//   let ownersMultisigImpersonated: SignerWithAddress
//   let administrator: SignerWithAddress
//   let user: SignerWithAddress
//   let referrer: SignerWithAddress
//   let referrer2: SignerWithAddress
//   let addressBook: AddressBook
//   let accessRoles: AccessRoles
//   let objectsFactory: ObjectsFactory
//   let referralProgram: ReferralProgram
//   let initSnapshot: string

//   before(async () => {
//     await deployments.fixture()

//     const AddressBookDeployment = await deployments.get('AddressBook')
//     addressBook = AddressBook__factory.connect(AddressBookDeployment.address, ethers.provider)

//     console.log(`--- Initial data ---`)
//     console.log(`AddressBook: ${addressBook.address}`)

//     const AccessRolesDeployment = await deployments.get('AccessRoles')
//     accessRoles = AccessRoles__factory.connect(AccessRolesDeployment.address, ethers.provider)
//     assert(
//       accessRoles.address == (await addressBook.accessRoles()),
//       'accessRoles address not equal!',
//     )
//     console.log(`AccessRoles: ${accessRoles.address}`)

//     const ReferralProgramDeployment = await deployments.get('ReferralProgram')
//     referralProgram = ReferralProgram__factory.connect(
//       ReferralProgramDeployment.address,
//       ethers.provider,
//     )
//     assert(
//       referralProgram.address == (await addressBook.referralProgram()),
//       'referralProgram address not equal!',
//     )
//     console.log(`ReferralProgram: ${referralProgram.address}`)

//     const ObjectsFactoryDeployment = await deployments.get('ObjectsFactory')
//     objectsFactory = ObjectsFactory__factory.connect(
//       ObjectsFactoryDeployment.address,
//       ethers.provider,
//     )
//     assert(
//       objectsFactory.address == (await addressBook.objectsFactory()),
//       'objectsFactory address not equal!',
//     )
//     console.log(`ObjectsFactory: ${objectsFactory.address}`)

//     const OwnersMultisigDeployment = await deployments.get('OwnersMultisig')
//     ownersMultisig = MultisigWallet__factory.connect(
//       OwnersMultisigDeployment.address,
//       ethers.provider,
//     )
//     assert(
//       ownersMultisig.address == (await accessRoles.ownersMultisig()),
//       'ownersMultisig address not equal!',
//     )
//     console.log(`OwnersMultisig: ${ownersMultisig.address}`)

//     await helpers.impersonateAccount(ownersMultisig.address)
//     ownersMultisigImpersonated = await ethers.getSigner(ownersMultisig.address)
//     await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))

//     const accounts = await ethers.getSigners()
//     user = accounts[9]
//     referrer = accounts[8]
//     referrer2 = accounts[7]

//     console.log(`user: ${user.address}`)
//     console.log(`referrer: ${referrer.address}`)
//     console.log(`referrer2: ${referrer2.address}`)

//     const administratorAddress = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
//     await helpers.impersonateAccount(administratorAddress)
//     administrator = await ethers.getSigner(administratorAddress)
//     await helpers.setBalance(ownersMultisigImpersonated.address, ethers.utils.parseEther('100'))
//     assert(
//       await accessRoles.administrators(administrator.address),
//       'administrators address not found!',
//     )
//     console.log(`administrator: ${administrator.address}`)

//     initSnapshot = await ethers.provider.send('evm_snapshot', [])
//   })

//   afterEach(async () => {
//     console.log('--- End test ---')
//     await ethers.provider.send('evm_revert', [initSnapshot])
//     initSnapshot = await ethers.provider.send('evm_snapshot', [])
//   })

//   for (const { address: payTokenAddress, mintAmount } of CASES.tokens) {
//     it(`payTokenAddress ${payTokenAddress}`, async () => {
//       console.log(`payTokenAddress: ${payTokenAddress}`)
//       const maxShares = 1000
//       console.log(`maxShares: ${maxShares}`)
//       const stageId = 1
//       console.log(`stageId: ${stageId}`)
//       const oneSharePrice = ethers.utils.parseUnits('100', 18)
//       console.log(`oneSharePrice: ${oneSharePrice}`)
//       const referralProgramEnabled = true
//       console.log(`referralProgramEnabled: ${referralProgramEnabled}`)

//       console.log(`--- Create FullSaleObject ---`)
//       const objectId = 1
//       await objectsFactory
//         .connect(ownersMultisigImpersonated)
//         .createFullSaleObject(maxShares, 0, oneSharePrice, referralProgramEnabled)
//       const fullSaleObject = Object__factory.connect(
//         await objectsFactory.objectAddress(objectId),
//         ethers.provider,
//       )
//       console.log(`[+] ObjectId ${objectId} created`)
//       console.log(`Object address ${fullSaleObject.address}`)
//       assert((await fullSaleObject.maxShares()).eq(maxShares), 'maxShares!')
//       assert((await fullSaleObject.currentStage()).eq(stageId), 'currentStage!')
//       assert(
//         (await fullSaleObject.currentPriceOneShare()).eq(oneSharePrice),
//         'currentPriceOneShare!',
//       )
//       assert(
//         (await fullSaleObject.referralProgramEnabled()) == referralProgramEnabled,
//         'referralProgramEnabled!',
//       )

//       console.log(`--- Buy shares ---`)
//       console.log(`user ${user.address}`)
//       const buyShares = 5
//       console.log(`buyShares ${buyShares}`)
//       console.log(`referrer ${referrer.address}`)
//       const payToken = IERC20__factory.connect(payTokenAddress, ethers.provider)
//       await ERC20Minter.mint(payToken.address, user.address, mintAmount)
//       console.log(`Minted ${payToken.address} ${mintAmount} to user ${user.address}`)
//       const payTokenAmount = 0
//       // const payTokenAmount = await fullSaleObject
//       //   .connect(user)
//       //   .payTokenAmount(buyShares, payToken.address)
//       console.log(`payTokenAmount ${payTokenAmount}`)
//       await payToken.connect(user).approve(fullSaleObject.address, payTokenAmount)
//       console.log(
//         `user approved ${payToken.address} ${payTokenAmount} to ${fullSaleObject.address}`,
//       )

//       const payTokenBalanceBefore = await payToken.balanceOf(user.address)
//       console.log(`user payTokenBalanceBefore ${payTokenBalanceBefore}`)
//       const nftBalanceBefore = await fullSaleObject.balanceOf(user.address)
//       console.log(`user nftBalanceBefore ${nftBalanceBefore}`)

//       const nftId = 1
//       await fullSaleObject
//         .connect(user)
//         .buyShares(buyShares, payToken.address, payTokenAmount, referrer.address)

//       const payTokenBalanceAfter = await payToken.balanceOf(user.address)
//       console.log(`user payTokenBalanceAfter ${payTokenBalanceAfter}`)
//       const nftBalanceAfter = await fullSaleObject.balanceOf(user.address)
//       console.log(`user nftBalanceAfter ${nftBalanceAfter}`)

//       assert(
//         payTokenBalanceAfter.eq(payTokenBalanceBefore.sub(payTokenAmount)),
//         `payTokenAmount balane: payTokenBalanceAfter != payTokenBalanceBefore - payTokenAmount
//          | ${payTokenBalanceAfter} != ${payTokenBalanceBefore} - ${payTokenAmount})`,
//       )

//       assert(
//         nftBalanceAfter.eq(nftBalanceBefore.add(1)),
//         `payTokenAmount balane: nftBalanceAfter != nftBalanceBefore + 1
//          | ${nftBalanceAfter} != ${nftBalanceBefore} + ${1})`,
//       )

//       assert(
//         (await fullSaleObject.tokenShares(nftId)).eq(buyShares),
//         'buy shares amount != estimated',
//       )

//       console.log(`[+] user buy nftId ${nftId}`)

//       console.log(`--- Referral program ---`)

//       await ERC20Minter.mint(payToken.address, referralProgram.address, mintAmount)
//       console.log(
//         `Minted ${payToken.address} ${mintAmount} to referralProgram ${referralProgram.address}`,
//       )

//       const referrerPayTokenAmount = await referralProgram.payTokenAmount(
//         referrer.address,
//         fullSaleObject.address,
//         stageId,
//         payToken.address,
//       )
//       console.log(`refferer ${referrer.address} referrerPayTokenAmount ${referrerPayTokenAmount}`)

//       await expect(
//         referralProgram
//           .connect(referrer)
//           .claim(fullSaleObject.address, stageId, payToken.address, referrerPayTokenAmount),
//       ).to.be.revertedWith('stage not ready!')
//       console.log(`[+] referrer cant claim not ready stage!`)

//       const nftIdWithoutReferral = 2
//       await payToken.connect(user).approve(fullSaleObject.address, payTokenAmount)
//       console.log(
//         `user approved ${payToken.address} ${payTokenAmount} to ${fullSaleObject.address}`,
//       )
//       await fullSaleObject
//         .connect(user)
//         .buyShares(buyShares, payToken.address, payTokenAmount, ethers.constants.AddressZero)

//       console.log(`[+] user buy nftId ${nftIdWithoutReferral} without referral`)

//       assert(
//         (
//           await referralProgram.payTokenAmount(
//             ethers.constants.AddressZero,
//             fullSaleObject.address,
//             stageId,
//             payToken.address,
//           )
//         ).isZero(),
//         'referrer rewards send to zero address!',
//       )

//       await fullSaleObject.connect(administrator).disableReferralProgram()
//       console.log(`[+] administrator disableReferralProgram`)

//       const nftIdWithDisableReferral = 3
//       await payToken.connect(user).approve(fullSaleObject.address, payTokenAmount)
//       console.log(
//         `user approved ${payToken.address} ${payTokenAmount} to ${fullSaleObject.address}`,
//       )
//       await fullSaleObject
//         .connect(user)
//         .buyShares(buyShares, payToken.address, payTokenAmount, referrer.address)
//       console.log(`[+] user buy nftId ${nftIdWithDisableReferral} with disable referral`)

//       assert(
//         referrerPayTokenAmount.eq(
//           await referralProgram.payTokenAmount(
//             referrer.address,
//             fullSaleObject.address,
//             stageId,
//             payToken.address,
//           ),
//         ),
//         'referrer rewards send after disable progroom from object!',
//       )
//       console.log(`[+] referrer not recived rewards awter disable`)

//       await fullSaleObject.connect(ownersMultisigImpersonated).closeStage(stageId)
//       console.log(`[+] ownersMultisig close stageId ${stageId}`)

//       const referrerBalanceBefore = await payToken.balanceOf(referrer.address)
//       console.log(`referrerBalanceBefore ${referrerBalanceBefore}`)
//       await referralProgram
//         .connect(referrer)
//         .claim(fullSaleObject.address, stageId, payToken.address, referrerPayTokenAmount)
//       const referrerBalanceAfter = await payToken.balanceOf(referrer.address)
//       console.log(`referrerBalanceAfter ${referrerBalanceAfter}`)

//       assert(
//         referrerBalanceAfter.eq(referrerBalanceBefore.add(referrerPayTokenAmount)),
//         `referrerPayTokenAmount not equal. referrerBalanceAfter.eq(referrerBalanceBefore.add(referrerPayTokenAmount)) 
//         | ${referrerBalanceAfter}.eq(${referrerBalanceBefore}.add(${referrerPayTokenAmount}))`,
//       )
      
//       console.log(`[+] referrer claim rewards ${referrerBalanceAfter.sub(referrerBalanceBefore)}`)
//     })
//   }
// })
