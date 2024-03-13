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
  Treasury,
  Treasury__factory,
  Object as ObjectContract,
  IERC20,
  Pause__factory,
  Pause,
} from '../../../typechain-types'
import * as helpers from '@nomicfoundation/hardhat-network-helpers'
import { USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import { BigNumber } from 'ethers'

describe(`Object`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let objectsFactory: ObjectsFactory
  let treasury: Treasury
  let pause: Pause
  let initSnapshot: string

  before(async () => {
    await deployments.fixture()

    objectsFactory = ObjectsFactory__factory.connect(
      (await deployments.get('ObjectsFactory')).address,
      ethers.provider,
    )

    treasury = Treasury__factory.connect(
      (await deployments.get('Treasury')).address,
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

  describe('FullSale Object', () => {
    let object: ObjectContract
    let objectId: number
    let stageId: number
    let maxShares: number
    let saleStopTimestamp: number
    let priceOneShare: BigNumber
    let referralProgramEnabled: boolean

    beforeEach(async () => {
      objectId = 1
      stageId = 1
      maxShares = 100
      saleStopTimestamp = 0
      priceOneShare = ethers.utils.parseUnits('10', 18)
      referralProgramEnabled = true
      await objectsFactory
        .connect(ownersMultisigImpersonated)
        .createFullSaleObject(maxShares, saleStopTimestamp, priceOneShare, referralProgramEnabled)

      const objectAddress = await objectsFactory.objectAddress(objectId)
      object = Object__factory.connect(objectAddress, ethers.provider)
    })

    it('referral programm controllers', async () => {
      if (await object.referralProgramEnabled()) {
        await object.connect(administrator).disableReferralProgram()
        assert((await object.referralProgramEnabled()) == false, 'referral program not disabled!')
        await object.connect(ownersMultisigImpersonated).enableReferralProgram()
        assert((await object.referralProgramEnabled()) == true, 'referral program not enbled!')
      } else {
        await object.connect(ownersMultisigImpersonated).enableReferralProgram()
        assert((await object.referralProgramEnabled()) == true, 'referral program not enbled!')
        await object.connect(administrator).disableReferralProgram()
        assert((await object.referralProgramEnabled()) == false, 'referral program not disabled!')
      }
    })

    describe('Voting', () => {
      it('Regular create voting', async () => {
        const votingId = 1
        const sellPrice = ethers.utils.parseUnits('1000', 18)
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
        await object.connect(administrator).createVoting(sellPrice, timestamp)

        assert((await object.votingObjectSellPrice(votingId)).eq(sellPrice), 'voting sell price!')
        assert(
          (await object.votingExpiredTimestamp(votingId)).eq(timestamp),
          'voting expired timestamp!',
        )
      })

      it('Error user create voting', async () => {
        const sellPrice = ethers.utils.parseUnits('1000', 18)
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
        await expect(object.connect(user).createVoting(sellPrice, timestamp)).to.be.revertedWith(
          'only administrator',
        )
      })

      describe('Voting actions', () => {
        let votingId: number
        let sellPrice: BigNumber
        let votingExpiredTimestamp: number
        beforeEach(async () => {
          votingId = 1
          sellPrice = ethers.utils.parseUnits('1000', 18)
          votingExpiredTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
          await object.connect(administrator).createVoting(sellPrice, votingExpiredTimestamp)
        })

        it('Regular close voting', async () => {
          await object.connect(administrator).closeVoting(votingId)
          const votingExpiredTimestamp = await object.votingExpiredTimestamp(votingId)
          const timestampNow = (await ethers.provider.getBlock('latest')).timestamp
          assert(votingExpiredTimestamp.lte(timestampNow), 'voting not closed')
        })

        it('Error user close voting', async () => {
          await expect(object.connect(user).closeVoting(votingId)).to.be.revertedWith(
            'only administrator!',
          )
        })

        it('Regular double close voting', async () => {
          await object.connect(administrator).closeVoting(votingId)
          await expect(object.connect(administrator).closeVoting(votingId)).to.be.revertedWith(
            'can close only current voting!!',
          )
        })
      })
    })

    describe('Buy', () => {
      xit('Regular: estimateBuySharesUSD', async () => {
        const buyShares = 10

        const estimateBuySharesUSD = await object.estimateBuySharesUSD(user.address, buyShares)
        const calculatedSharesUSD = priceOneShare.mul(buyShares)

        assert(
          estimateBuySharesUSD.eq(calculatedSharesUSD),
          'estimateBuySharesUSD != calculatedSharesUSD',
        )
      })

      xit('Regular: buy', async () => {
        const buyShares = 10

        const payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 10000)

        const estimateBuySharesToken = await object.estimateBuySharesToken(
          user.address,
          buyShares,
          payToken.address,
        )

        const objectPayTokenBalanceBefore = await payToken.balanceOf(object.address)
        const userPayTokenBalanceBefore = await payToken.balanceOf(user.address)
        const nftBalanceBefore = await object.balanceOf(user.address)

        await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

        const tokenId = 1
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )

        const objectPayTokenBalanceAfter = await payToken.balanceOf(object.address)
        const userPayTokenBalanceAfter = await payToken.balanceOf(user.address)
        const nftBalanceAfter = await object.balanceOf(user.address)

        assert(
          objectPayTokenBalanceAfter.eq(objectPayTokenBalanceBefore.add(estimateBuySharesToken)),
          `objectPayTokenBalanceAfter!`,
        )

        assert(
          userPayTokenBalanceAfter.eq(userPayTokenBalanceBefore.sub(estimateBuySharesToken)),
          `payTokenAmount balane: userPayTokenBalanceAfter != userPayTokenBalanceBefore - estimateBuySharesToken
           | ${userPayTokenBalanceAfter} != ${userPayTokenBalanceBefore} - ${estimateBuySharesToken})`,
        )

        assert(
          nftBalanceAfter.eq(nftBalanceBefore.add(1)),
          `payTokenAmount balane: nftBalanceAfter != nftBalanceBefore + 1
           | ${nftBalanceAfter} != ${nftBalanceBefore} + ${1})`,
        )

        assert((await object.tokenShares(tokenId)).eq(buyShares), 'buy shares amount != estimated')
      })

      xit('Error: buy more max shares', async () => {
        const buyShares = maxShares + 10

        const payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 10000)
        await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

        await expect(
          object
            .connect(user)
            .buyShares(
              buyShares,
              payToken.address,
              ethers.constants.MaxUint256,
              ethers.constants.AddressZero,
            ),
        ).to.be.revertedWith('stageAvailableShares!')
      })

      it('Error buy: paused', async () => {
        const buyShares = maxShares + 10

        const payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 10000)
        await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

        await pause.connect(administrator).pause()

        await expect(
          object
            .connect(user)
            .buyShares(
              buyShares,
              payToken.address,
              ethers.constants.MaxUint256,
              ethers.constants.AddressZero,
            ),
        ).to.be.revertedWith('paused!')
      })
    })

    describe('Object token actions', () => {
      let payToken: IERC20
      let buyShares: number
      let tokenId: number
      beforeEach(async () => {
        payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 100000)
        await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

        buyShares = 10
        tokenId = 1
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )
      })

      describe('Exit', () => {
        it('Regalar exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(1)

          const userPayTokenBalanceBefore = await payToken.balanceOf(user.address)
          const userNftBalanceBefore = await object.balanceOf(user.address)

          await object.connect(user).exit(tokenId)

          const userPayTokenBalanceAfter = await payToken.balanceOf(user.address)
          const userNftBalanceAfter = await object.balanceOf(user.address)

          const estimateBuySharesToken = await object.estimateBuySharesToken(
            user.address,
            buyShares,
            payToken.address,
          )

          assert(userNftBalanceAfter.eq(userNftBalanceBefore.sub(1)), 'nft not tranfered from user')
          await expect(object.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID')
          assert(
            userPayTokenBalanceAfter.eq(userPayTokenBalanceBefore.add(estimateBuySharesToken)),
            'user not recieved pay tokens!',
          )
        })

        it('Error exit not token owner', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(1)

          await expect(object.connect(administrator).exit(tokenId)).to.be.revertedWith(
            'only token owner!',
          )
        })

        it('Error double exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(1)

          await object.connect(user).exit(tokenId)
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'ERC721: invalid token ID',
          )
        })

        it('Error exit: sale stop timestamp disabled', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(0)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: sale stop timestamp not expired', async () => {
          const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(timestamp)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: paused', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(1)

          await pause.connect(administrator).pause()
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith('paused!')
        })
      })
    })
  })

  xit(`stage sale object`, async () => {
    const objectId = 1
    const objectAddress = await objectsFactory.objectAddress(objectId)
    const stageId = 1
    const maxShares = 100
    const intialStageAvailableShares = 10
    const intialStageSaleStopTimestamp = 0
    const priceOneShare = ethers.utils.parseUnits('100', 18)
    const referralProgramEnabled = true

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
  })

  xit('Regular: Upgarde only deployer', async () => {
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

  xit('Error unit: Upgarde not owner', async () => {
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
