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
import { USDC, USDCe, USDT } from '../../../constants/addresses'
import ERC20Minter from '../../utils/ERC20Minter'
import { getImplementationAddress } from '@openzeppelin/upgrades-core'
import { BigNumber } from 'ethers'

describe(`Object`, () => {
  let ownersMultisig: MultisigWallet
  let ownersMultisigImpersonated: SignerWithAddress
  let administrator: SignerWithAddress
  let user: SignerWithAddress
  let user2: SignerWithAddress
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
    user2 = accounts[2]

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

    it('Error create stage with zero price', async () => {
      await expect(
        object.connect(ownersMultisigImpersonated).createNewStage(1, 0, 0),
      ).to.be.revertedWith('_oneSharePrice is zero!')
    })

    it('Error create zero stage', async () => {
      await expect(
        object.connect(ownersMultisigImpersonated).createNewStage(0, 1, 0),
      ).to.be.revertedWith('_shares is zero!')
    })

    it('Error cant create new stage for full sale object', async () => {
      await object.connect(ownersMultisigImpersonated).closeStage(stageId)
      await expect(
        object.connect(ownersMultisigImpersonated).createNewStage(1, 1, 0),
      ).to.be.revertedWith('maxShares!')
    })

    describe('Buy', () => {
      it('Regular: estimateBuySharesUSD', async () => {
        const buyShares = 10

        const estimateBuySharesUSD = await object.estimateBuySharesUSD(user.address, buyShares)
        const calculatedSharesUSD = priceOneShare.mul(buyShares)

        assert(
          estimateBuySharesUSD.eq(calculatedSharesUSD),
          'estimateBuySharesUSD != calculatedSharesUSD',
        )
      })

      it('Regular: buy', async () => {
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

      it('Error: buy more max shares', async () => {
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

      it('Regular: personal price', async () => {
        const buyShares = 10

        const payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 10000)

        const estimateBuySharesToken = await object.estimateBuySharesToken(
          user.address,
          buyShares,
          payToken.address,
        )

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

        const newPrice = priceOneShare.add(ethers.utils.parseUnits('1', 18))

        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice)

        const userPayTokenBalanceBefore = await payToken.balanceOf(user.address)

        const tokenId2 = 2
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )
        const userPayTokenBalanceAfter = await payToken.balanceOf(user.address)

        const newPersonalPrice = await object.getPriceForUser(user.address)

        assert(
          newPersonalPrice.eq(priceOneShare),
          `user personal price updated! ${newPersonalPrice} != ${priceOneShare}`,
        )

        assert(
          userPayTokenBalanceAfter.eq(userPayTokenBalanceBefore.sub(estimateBuySharesToken)),
          `personal price not working! ${userPayTokenBalanceAfter} != ${userPayTokenBalanceBefore} - ${estimateBuySharesToken}`,
        )

        const newPrice2 = priceOneShare.sub(ethers.utils.parseUnits('1', 18))

        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice2)

        const newPersonalPrice2 = await object.getPriceForUser(user.address)

        assert(
          newPersonalPrice2.eq(newPrice2),
          `user personal price not updated! ${newPersonalPrice2} != ${newPrice2}`,
        )

        const estimateBuySharesToken2 = await object.estimateBuySharesToken(
          user.address,
          buyShares,
          payToken.address,
        )

        assert(
          estimateBuySharesToken2.lt(estimateBuySharesToken),
          `user not get less price! ${estimateBuySharesToken2} <= ${estimateBuySharesToken}`,
        )

        const userPayTokenBalanceBefore2 = await payToken.balanceOf(user.address)

        const tokenId3 = 3
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )
        const userPayTokenBalanceAfter2 = await payToken.balanceOf(user.address)

        assert(
          userPayTokenBalanceAfter2.eq(userPayTokenBalanceBefore2.sub(estimateBuySharesToken2)),
          `personal price not working! ${userPayTokenBalanceAfter2} != ${userPayTokenBalanceBefore2} - ${estimateBuySharesToken2}`,
        )
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
          'only administrator!',
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

        it('Error close not current voting', async () => {
          await expect(object.connect(administrator).closeVoting(100)).to.be.revertedWith(
            'can close only current voting!',
          )
        })

        it('Error double close voting', async () => {
          await object.connect(administrator).closeVoting(votingId)
          await expect(object.connect(administrator).closeVoting(votingId)).to.be.revertedWith(
            'voting expired!',
          )
        })

        describe('With object tokens', () => {
          let tokenId: number
          let tokenShares: number

          beforeEach(async () => {
            const payToken = IERC20__factory.connect(USDT, ethers.provider)
            await ERC20Minter.mint(payToken.address, user.address, 100000)
            await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

            tokenId = 1
            tokenShares = 5
            await object
              .connect(user)
              .buyShares(
                tokenShares,
                payToken.address,
                ethers.constants.MaxUint256,
                ethers.constants.AddressZero,
              )
          })

          it('split/merge', async () => {
            const rightShares = 3
            const leftTokenId = 2
            const rightTokenId = 3

            await expect(object.connect(user).splitToken(tokenId, rightShares)).to.be.rejectedWith('stage not ready!')
            await object.connect(ownersMultisigImpersonated).closeStage(stageId)

            const userNftBalanceBefore = await object.balanceOf(user.address)
            await object.connect(user).splitToken(tokenId, rightShares)

            const userNftBalanceAfter = await object.balanceOf(user.address)

            assert(
              userNftBalanceAfter.eq(userNftBalanceBefore.add(1)),
              'user not recived right token!',
            )

            assert(
              (await object.tokenShares(leftTokenId)).eq(tokenShares - rightShares),
              'left token shares!',
            )
            assert((await object.tokenShares(rightTokenId)).eq(rightShares), 'rigth token shares!')
            await expect(object.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID')

            const mergedTokenId = 4
            const userNftBalanceBefore2 = await object.balanceOf(user.address)
            await object.connect(user).mergeTokens(leftTokenId, rightTokenId)
            const userNftBalanceAfter2 = await object.balanceOf(user.address)
            assert(userNftBalanceAfter2.eq(userNftBalanceBefore2.sub(1)), 'user tokens not burned!')
            const mergedTokenShares = await object.tokenShares(mergedTokenId)
            assert(
              mergedTokenShares.eq(tokenShares),
              `merged token shares! ${mergedTokenShares} != ${tokenShares}`,
            )
          })

          it('Regular vote yes', async () => {
            await object.connect(user).vote(votingId, tokenId, true)
            assert((await object.tokenVoted(votingId, tokenId)) == true, 'token voted not setted!')
            assert(
              (await object.votingYesShares(votingId)).eq(await object.tokenShares(tokenId)),
              'voting not recived shares power!',
            )
            assert(
              (await object.votingNoShares(votingId)).eq(0),
              'other voting answer recived shares power!',
            )
          })

          it('Regular vote no', async () => {
            await object.connect(user).vote(votingId, tokenId, false)
            assert((await object.tokenVoted(votingId, tokenId)) == true, 'token voted not setted!')
            assert(
              (await object.votingNoShares(votingId)).eq(await object.tokenShares(tokenId)),
              'voting not recived shares power!',
            )
            assert(
              (await object.votingYesShares(votingId)).eq(0),
              'other voting answer recived shares power!',
            )
          })

          it('Error double vote after yes vote', async () => {
            await object.connect(user).vote(votingId, tokenId, true)
            await expect(object.connect(user).vote(votingId, tokenId, true)).to.be.revertedWith(
              'token already voted!',
            )
            await expect(object.connect(user).vote(votingId, tokenId, false)).to.be.revertedWith(
              'token already voted!',
            )
          })

          it('Error double vote after no vote', async () => {
            await object.connect(user).vote(votingId, tokenId, false)
            await expect(object.connect(user).vote(votingId, tokenId, true)).to.be.revertedWith(
              'token already voted!',
            )
            await expect(object.connect(user).vote(votingId, tokenId, false)).to.be.revertedWith(
              'token already voted!',
            )
          })
        })
      })
    })

    describe('With minted tokens', () => {
      let payTokens: IERC20[]
      beforeEach(async () => {
        payTokens = []
        for (const payTokenAddress of [USDT, USDC, USDCe]) {
          const buyShares = 10
          const payToken = IERC20__factory.connect(payTokenAddress, ethers.provider)
          payTokens.push(payToken)
          await ERC20Minter.mint(payToken.address, user.address, 10000)
          await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)
          await object
            .connect(user)
            .buyShares(
              buyShares,
              payToken.address,
              ethers.constants.MaxUint256,
              ethers.constants.AddressZero,
            )
        }
      })

      it('Regular: ownersMultisig setStagePriceOneShare', async () => {
        const newPrice = ethers.utils.parseUnits('178', 18)
        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice)
        assert(
          (await object.currentPriceOneShare()).eq(newPrice),
          'currentPriceOneShare not updated!',
        )
      })

      it('Error: not ownersMultisig setStagePriceOneShare', async () => {
        const newPrice = ethers.utils.parseUnits('178', 18)
        await expect(
          object.connect(administrator).setStagePriceOneShare(stageId, newPrice),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig close stage', async () => {
        const stageAvailableShares = await object.stageAvailableShares(stageId)
        const companySharesBefore = await object.companyShares()
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        const companySharesAfter = await object.companyShares()
        assert(
          companySharesAfter.eq(companySharesBefore.add(stageAvailableShares)),
          'company not recived shares!',
        )
      })

      it('Error: not ownersMultisig close stage', async () => {
        await expect(object.connect(administrator).closeStage(stageId)).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: ownersMultisig addEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(ownersMultisigImpersonated).addEarnings(addedEarnings)
        const objectEarningsAfter = await object.earnings()
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.add(addedEarnings)),
          'earnings not updated!',
        )
      })

      it('Error: not ownersMultisig addEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        await expect(object.connect(administrator).addEarnings(addedEarnings)).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: administrator subEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        await object.connect(ownersMultisigImpersonated).addEarnings(addedEarnings)

        const subEarnings = ethers.utils.parseUnits('1000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(administrator).subEarnings(subEarnings)
        const objectEarningsAfter = await object.earnings()
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.sub(subEarnings)),
          'earnings not removed!',
        )
      })

      it('Error: not administrator subEarnings', async () => {
        const subEarnings = ethers.utils.parseUnits('1000', 18)
        await expect(object.connect(user).subEarnings(subEarnings)).to.be.revertedWith(
          'only administrator!',
        )
      })

      it('Regular: ownersMultisig sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice)
        const objectEarningsAfter = await object.earnings()
        assert((await object.isSold()) == true, 'isSold not updated')
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.add(sellPrice)),
          'earnings not updated after sell!',
        )
      })

      it('Error: double sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        await object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice)
        await expect(
          object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice),
        ).to.be.revertedWith('object already sold!')
      })

      it('Error: not ownersMultisig sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        await expect(
          object.connect(administrator).sellObjectAndClose(sellPrice),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig buySharesForCompany', async () => {
        const sharesAmount = 7
        const companySharesBefore = await object.companyShares()
        await object.connect(ownersMultisigImpersonated).buySharesForCompany(sharesAmount)
        const companySharesAfter = await object.companyShares()
        assert(
          companySharesAfter.eq(companySharesBefore.add(sharesAmount)),
          'company not recived shares!',
        )
      })

      it('Regular: ownersMultisig buySharesForCompany all stage supply', async () => {
        const availableShares = await object.stageAvailableShares(stageId)
        const companySharesBefore = await object.companyShares()

        const objectBalancesBefore = []
        const treasuryBalancesBefore = []
        for (const payToken of payTokens) {
          objectBalancesBefore.push(await payToken.balanceOf(object.address))
          treasuryBalancesBefore.push(await payToken.balanceOf(treasury.address))
        }

        await object.connect(ownersMultisigImpersonated).buySharesForCompany(availableShares)
        const companySharesAfter = await object.companyShares()

        const treasuryBalancesAfter = []
        for (const payToken of payTokens) {
          treasuryBalancesAfter.push(await payToken.balanceOf(treasury.address))
        }

        assert(
          companySharesAfter.eq(companySharesBefore.add(availableShares)),
          'company not recived shares!',
        )

        for (let i = 0; i < payTokens.length; i++) {
          assert(
            treasuryBalancesAfter[i].eq(treasuryBalancesBefore[i].add(objectBalancesBefore[i])),
            'treasury not recived tokens!',
          )
        }
      })

      it('Error: not ownersMultisig buySharesForCompany', async () => {
        const sharesAmount = 7
        await expect(
          object.connect(administrator).buySharesForCompany(sharesAmount),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig withdrawCompanyShares', async () => {
        const companySharesAmount = 7
        await object.connect(ownersMultisigImpersonated).buySharesForCompany(companySharesAmount)

        const withdrawSharesAmount = 5
        const virtualPrice = ethers.utils.parseUnits('789', 18)
        const userNftBalanceBefore = await object.balanceOf(user.address)
        const companySharesBefore = await object.companyShares()
        await object
          .connect(ownersMultisigImpersonated)
          .withdrawCompanyShares(withdrawSharesAmount, user.address, virtualPrice)
        const companySharesAfter = await object.companyShares()
        const userNftBalanceAfter = await object.balanceOf(user.address)

        assert(userNftBalanceAfter.eq(userNftBalanceBefore.add(1)), 'user not recived nft!')

        const nftId = userNftBalanceAfter
        assert((await object.tokenBuyPrice(nftId)).eq(virtualPrice), 'virtualPrice not setted!')

        assert(
          companySharesAfter.eq(companySharesBefore.sub(withdrawSharesAmount)),
          'company not recived shares!',
        )
      })

      it('Error: not ownersMultisig withdrawCompanyShares', async () => {
        const sharesAmount = 7
        await expect(
          object.connect(administrator).withdrawCompanyShares(sharesAmount, user.address, 0),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig closeSale', async () => {
        await object.connect(ownersMultisigImpersonated).closeSale()
        assert((await object.isActiveSale()) == false, 'sale not closed')
        const nowTimestamp = (await ethers.provider.getBlock('latest')).timestamp
        assert(
          (await object.stageSaleStopTimestamp(stageId)).lte(nowTimestamp),
          'stageSaleStopTimestamp not updated',
        )
      })

      it('Error: not ownersMultisig closeSale', async () => {
        await expect(object.connect(administrator).closeSale()).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: ownersMultisig setSaleStopTimestamp', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 50
        await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, timestamp)

        assert(
          (await object.stageSaleStopTimestamp(stageId)).lte(timestamp),
          'stageSaleStopTimestamp not updated',
        )

        await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 0)
        assert(
          (await object.stageSaleStopTimestamp(stageId)).eq(0),
          'stageSaleStopTimestamp not deleted',
        )
      })

      it('Error: not ownersMultisig setSaleStopTimestamp', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 50
        await expect(
          object.connect(administrator).setSaleStopTimestamp(stageId, timestamp),
        ).to.be.revertedWith('only owners multisig!')
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

      it('requireTokenReady', async () => {
        await expect(object.requireTokenReady(tokenId)).to.be.revertedWith('stage not ready!')
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        await object.requireTokenReady(tokenId)
      })

      it('requireStageReady', async () => {
        await expect(object.requireStageReady(0)).to.be.revertedWith('stage not exists!')
        await expect(object.requireStageReady(100)).to.be.revertedWith('stage not exists!')
        await expect(object.requireStageReady(stageId)).to.be.revertedWith('stage not ready!')
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        await object.requireStageReady(stageId)
      })

      describe('Exit', () => {
        it('Regalar exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

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
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await expect(object.connect(administrator).exit(tokenId)).to.be.revertedWith(
            'only token owner!',
          )
        })

        it('Error double exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await object.connect(user).exit(tokenId)
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'ERC721: invalid token ID',
          )
        })

        it('Error exit: sale stop timestamp disabled', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 0)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: sale stop timestamp not expired', async () => {
          const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, timestamp)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: paused', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await pause.connect(administrator).pause()
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith('paused!')
        })
      })
    })
  })


  describe('StageSale Object', () => {
    let object: ObjectContract
    let objectId: number
    let stageId: number
    let maxShares: number
    let intialStageAvailableShares: number
    let intialStageSaleStopTimestamp: number
    let priceOneShare: BigNumber
    let referralProgramEnabled: boolean

    beforeEach(async () => {
      objectId = 1
      const objectAddress = await objectsFactory.objectAddress(objectId)
      stageId = 1
      maxShares = 100
      intialStageAvailableShares = 20
      intialStageSaleStopTimestamp = 0
      priceOneShare = ethers.utils.parseUnits('10', 18)
      referralProgramEnabled = true

      await objectsFactory
        .connect(ownersMultisigImpersonated)
        .createStageSaleObject(
          maxShares,
          intialStageAvailableShares,
          intialStageSaleStopTimestamp,
          priceOneShare,
          referralProgramEnabled,
        )

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

    it('Error create stage with zero price', async () => {
      await expect(
        object.connect(ownersMultisigImpersonated).createNewStage(1, 0, 0),
      ).to.be.revertedWith('_oneSharePrice is zero!')
    })

    it('Error create zero stage', async () => {
      await expect(
        object.connect(ownersMultisigImpersonated).createNewStage(0, 1, 0),
      ).to.be.revertedWith('_shares is zero!')
    })

    // it('Error cant create new stage for full sale object', async () => {
    //   await object.connect(ownersMultisigImpersonated).closeStage(stageId)
    //   await expect(
    //     object.connect(ownersMultisigImpersonated).createNewStage(1, 1, 0),
    //   ).to.be.revertedWith('maxShares!')
    // })

    describe('Buy', () => {
      it('Regular: estimateBuySharesUSD', async () => {
        const buyShares = 10

        const estimateBuySharesUSD = await object.estimateBuySharesUSD(user.address, buyShares)
        const calculatedSharesUSD = priceOneShare.mul(buyShares)

        assert(
          estimateBuySharesUSD.eq(calculatedSharesUSD),
          'estimateBuySharesUSD != calculatedSharesUSD',
        )
      })

      it('Regular: buy', async () => {
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

        assert(await object.ownerOf(tokenId) == user.address, "user not received nft!")

        const objectPayTokenBalanceAfter = await payToken.balanceOf(object.address)
        const userPayTokenBalanceAfter = await payToken.balanceOf(user.address)
        const nftBalanceAfter = await object.balanceOf(user.address)

        assert(
          objectPayTokenBalanceAfter.eq(objectPayTokenBalanceBefore.add(estimateBuySharesToken)),
          `objectPayTokenBalanceAfter! ${objectPayTokenBalanceAfter} !+ ${objectPayTokenBalanceBefore} + ${estimateBuySharesToken}`,
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

      it('Error: buy more max shares', async () => {
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

      it('Regular: personal price', async () => {
        const buyShares = 5

        const payToken = IERC20__factory.connect(USDT, ethers.provider)
        await ERC20Minter.mint(payToken.address, user.address, 10000)

        const estimateBuySharesToken = await object.estimateBuySharesToken(
          user.address,
          buyShares,
          payToken.address,
        )

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

        const newPrice = priceOneShare.add(ethers.utils.parseUnits('1', 18))

        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice)

        const userPayTokenBalanceBefore = await payToken.balanceOf(user.address)

        const tokenId2 = 2
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )
        const userPayTokenBalanceAfter = await payToken.balanceOf(user.address)

        const newPersonalPrice = await object.getPriceForUser(user.address)

        assert(
          newPersonalPrice.eq(priceOneShare),
          `user personal price updated! ${newPersonalPrice} != ${priceOneShare}`,
        )

        assert(
          userPayTokenBalanceAfter.eq(userPayTokenBalanceBefore.sub(estimateBuySharesToken)),
          `personal price not working! ${userPayTokenBalanceAfter} != ${userPayTokenBalanceBefore} - ${estimateBuySharesToken}`,
        )

        const newPrice2 = priceOneShare.sub(ethers.utils.parseUnits('1', 18))

        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice2)

        const newPersonalPrice2 = await object.getPriceForUser(user.address)

        assert(
          newPersonalPrice2.eq(newPrice2),
          `user personal price not updated! ${newPersonalPrice2} != ${newPrice2}`,
        )

        const estimateBuySharesToken2 = await object.estimateBuySharesToken(
          user.address,
          buyShares,
          payToken.address,
        )

        assert(
          estimateBuySharesToken2.lt(estimateBuySharesToken),
          `user not get less price! ${estimateBuySharesToken2} <= ${estimateBuySharesToken}`,
        )

        const userPayTokenBalanceBefore2 = await payToken.balanceOf(user.address)

        const tokenId3 = 3
        await object
          .connect(user)
          .buyShares(
            buyShares,
            payToken.address,
            ethers.constants.MaxUint256,
            ethers.constants.AddressZero,
          )
        const userPayTokenBalanceAfter2 = await payToken.balanceOf(user.address)

        assert(
          userPayTokenBalanceAfter2.eq(userPayTokenBalanceBefore2.sub(estimateBuySharesToken2)),
          `personal price not working! ${userPayTokenBalanceAfter2} != ${userPayTokenBalanceBefore2} - ${estimateBuySharesToken2}`,
        )
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

    // describe('Voting', () => {
    //   it('Regular create voting', async () => {
    //     const votingId = 1
    //     const sellPrice = ethers.utils.parseUnits('1000', 18)
    //     const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
    //     await object.connect(administrator).createVoting(sellPrice, timestamp)

    //     assert((await object.votingObjectSellPrice(votingId)).eq(sellPrice), 'voting sell price!')
    //     assert(
    //       (await object.votingExpiredTimestamp(votingId)).eq(timestamp),
    //       'voting expired timestamp!',
    //     )
    //   })

    //   it('Error user create voting', async () => {
    //     const sellPrice = ethers.utils.parseUnits('1000', 18)
    //     const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
    //     await expect(object.connect(user).createVoting(sellPrice, timestamp)).to.be.revertedWith(
    //       'only administrator!',
    //     )
    //   })

    //   describe('Voting actions', () => {
    //     let votingId: number
    //     let sellPrice: BigNumber
    //     let votingExpiredTimestamp: number
    //     beforeEach(async () => {
    //       votingId = 1
    //       sellPrice = ethers.utils.parseUnits('1000', 18)
    //       votingExpiredTimestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
    //       await object.connect(administrator).createVoting(sellPrice, votingExpiredTimestamp)
    //     })

    //     it('Regular close voting', async () => {
    //       await object.connect(administrator).closeVoting(votingId)
    //       const votingExpiredTimestamp = await object.votingExpiredTimestamp(votingId)
    //       const timestampNow = (await ethers.provider.getBlock('latest')).timestamp
    //       assert(votingExpiredTimestamp.lte(timestampNow), 'voting not closed')
    //     })

    //     it('Error user close voting', async () => {
    //       await expect(object.connect(user).closeVoting(votingId)).to.be.revertedWith(
    //         'only administrator!',
    //       )
    //     })

    //     it('Error close not current voting', async () => {
    //       await expect(object.connect(administrator).closeVoting(100)).to.be.revertedWith(
    //         'can close only current voting!',
    //       )
    //     })

    //     it('Error double close voting', async () => {
    //       await object.connect(administrator).closeVoting(votingId)
    //       await expect(object.connect(administrator).closeVoting(votingId)).to.be.revertedWith(
    //         'voting expired!',
    //       )
    //     })

    //     describe('With object tokens', () => {
    //       let tokenId: number
    //       let tokenShares: number

    //       beforeEach(async () => {
    //         const payToken = IERC20__factory.connect(USDT, ethers.provider)
    //         await ERC20Minter.mint(payToken.address, user.address, 100000)
    //         await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)

    //         tokenId = 1
    //         tokenShares = 5
    //         await object
    //           .connect(user)
    //           .buyShares(
    //             tokenShares,
    //             payToken.address,
    //             ethers.constants.MaxUint256,
    //             ethers.constants.AddressZero,
    //           )
    //       })

    //       it('split/merge', async () => {
    //         const rightShares = 3
    //         const leftTokenId = 2
    //         const rightTokenId = 3

    //         await expect(object.connect(user).splitToken(tokenId, rightShares)).to.be.rejectedWith('stage not ready!')
    //         await object.connect(ownersMultisigImpersonated).closeStage(stageId)

    //         const userNftBalanceBefore = await object.balanceOf(user.address)
    //         await object.connect(user).splitToken(tokenId, rightShares)

    //         const userNftBalanceAfter = await object.balanceOf(user.address)

    //         assert(
    //           userNftBalanceAfter.eq(userNftBalanceBefore.add(1)),
    //           'user not recived right token!',
    //         )

    //         assert(
    //           (await object.tokenShares(leftTokenId)).eq(tokenShares - rightShares),
    //           'left token shares!',
    //         )
    //         assert((await object.tokenShares(rightTokenId)).eq(rightShares), 'rigth token shares!')
    //         await expect(object.ownerOf(tokenId)).to.be.revertedWith('ERC721: invalid token ID')

    //         const mergedTokenId = 4
    //         const userNftBalanceBefore2 = await object.balanceOf(user.address)
    //         await object.connect(user).mergeTokens(leftTokenId, rightTokenId)
    //         const userNftBalanceAfter2 = await object.balanceOf(user.address)
    //         assert(userNftBalanceAfter2.eq(userNftBalanceBefore2.sub(1)), 'user tokens not burned!')
    //         const mergedTokenShares = await object.tokenShares(mergedTokenId)
    //         assert(
    //           mergedTokenShares.eq(tokenShares),
    //           `merged token shares! ${mergedTokenShares} != ${tokenShares}`,
    //         )
    //       })

    //       it('Regular vote yes', async () => {
    //         await object.connect(user).vote(votingId, tokenId, true)
    //         assert((await object.tokenVoted(votingId, tokenId)) == true, 'token voted not setted!')
    //         assert(
    //           (await object.votingYesShares(votingId)).eq(await object.tokenShares(tokenId)),
    //           'voting not recived shares power!',
    //         )
    //         assert(
    //           (await object.votingNoShares(votingId)).eq(0),
    //           'other voting answer recived shares power!',
    //         )
    //       })

    //       it('Regular vote no', async () => {
    //         await object.connect(user).vote(votingId, tokenId, false)
    //         assert((await object.tokenVoted(votingId, tokenId)) == true, 'token voted not setted!')
    //         assert(
    //           (await object.votingNoShares(votingId)).eq(await object.tokenShares(tokenId)),
    //           'voting not recived shares power!',
    //         )
    //         assert(
    //           (await object.votingYesShares(votingId)).eq(0),
    //           'other voting answer recived shares power!',
    //         )
    //       })

    //       it('Error double vote after yes vote', async () => {
    //         await object.connect(user).vote(votingId, tokenId, true)
    //         await expect(object.connect(user).vote(votingId, tokenId, true)).to.be.revertedWith(
    //           'token already voted!',
    //         )
    //         await expect(object.connect(user).vote(votingId, tokenId, false)).to.be.revertedWith(
    //           'token already voted!',
    //         )
    //       })

    //       it('Error double vote after no vote', async () => {
    //         await object.connect(user).vote(votingId, tokenId, false)
    //         await expect(object.connect(user).vote(votingId, tokenId, true)).to.be.revertedWith(
    //           'token already voted!',
    //         )
    //         await expect(object.connect(user).vote(votingId, tokenId, false)).to.be.revertedWith(
    //           'token already voted!',
    //         )
    //       })
    //     })
    //   })
    // })

    describe('With minted tokens', () => {
      let payTokens: IERC20[]
      beforeEach(async () => {
        payTokens = []
        for (const payTokenAddress of [USDT, USDC, USDCe]) {
          const buyShares = 5
          const payToken = IERC20__factory.connect(payTokenAddress, ethers.provider)
          payTokens.push(payToken)
          await ERC20Minter.mint(payToken.address, user.address, 10000)
          await payToken.connect(user).approve(object.address, ethers.constants.MaxUint256)
          await object
            .connect(user)
            .buyShares(
              buyShares,
              payToken.address,
              ethers.constants.MaxUint256,
              ethers.constants.AddressZero,
            )
        }
      })

      it('Regular: ownersMultisig setStagePriceOneShare', async () => {
        const newPrice = ethers.utils.parseUnits('178', 18)
        await object.connect(ownersMultisigImpersonated).setStagePriceOneShare(stageId, newPrice)
        assert(
          (await object.currentPriceOneShare()).eq(newPrice),
          'currentPriceOneShare not updated!',
        )
      })

      it('Error: not ownersMultisig setStagePriceOneShare', async () => {
        const newPrice = ethers.utils.parseUnits('178', 18)
        await expect(
          object.connect(administrator).setStagePriceOneShare(stageId, newPrice),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig close stage', async () => {
        const stageAvailableShares = await object.stageAvailableShares(stageId)
        const companySharesBefore = await object.companyShares()
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        const companySharesAfter = await object.companyShares()
        assert(
          companySharesAfter.eq(companySharesBefore.add(stageAvailableShares)),
          'company not recived shares!',
        )
      })

      it('Error: not ownersMultisig close stage', async () => {
        await expect(object.connect(administrator).closeStage(stageId)).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: ownersMultisig addEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(ownersMultisigImpersonated).addEarnings(addedEarnings)
        const objectEarningsAfter = await object.earnings()
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.add(addedEarnings)),
          'earnings not updated!',
        )
      })

      it('Error: not ownersMultisig addEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        await expect(object.connect(administrator).addEarnings(addedEarnings)).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: administrator subEarnings', async () => {
        const addedEarnings = ethers.utils.parseUnits('1000', 18)
        await object.connect(ownersMultisigImpersonated).addEarnings(addedEarnings)

        const subEarnings = ethers.utils.parseUnits('1000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(administrator).subEarnings(subEarnings)
        const objectEarningsAfter = await object.earnings()
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.sub(subEarnings)),
          'earnings not removed!',
        )
      })

      it('Error: not administrator subEarnings', async () => {
        const subEarnings = ethers.utils.parseUnits('1000', 18)
        await expect(object.connect(user).subEarnings(subEarnings)).to.be.revertedWith(
          'only administrator!',
        )
      })

      it('Regular: ownersMultisig sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        const objectEarningsBefore = await object.earnings()
        await object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice)
        const objectEarningsAfter = await object.earnings()
        assert((await object.isSold()) == true, 'isSold not updated')
        assert(
          objectEarningsAfter.eq(objectEarningsBefore.add(sellPrice)),
          'earnings not updated after sell!',
        )
      })

      it('Error: double sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        await object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice)
        await expect(
          object.connect(ownersMultisigImpersonated).sellObjectAndClose(sellPrice),
        ).to.be.revertedWith('object already sold!')
      })

      it('Error: not ownersMultisig sellObjectAndClose', async () => {
        const sellPrice = ethers.utils.parseUnits('10000', 18)
        await expect(
          object.connect(administrator).sellObjectAndClose(sellPrice),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig buySharesForCompany', async () => {
        const sharesAmount = 1
        const companySharesBefore = await object.companyShares()
        await object.connect(ownersMultisigImpersonated).buySharesForCompany(sharesAmount)
        const companySharesAfter = await object.companyShares()
        assert(
          companySharesAfter.eq(companySharesBefore.add(sharesAmount)),
          `company not recived shares! ${companySharesAfter} != ${companySharesBefore} + ${sharesAmount}`,
        )
      })

      it('Regular: ownersMultisig buySharesForCompany > stageAvailableShares', async () => {
        const stageAvailableShares = await object.stageAvailableShares(1)
        const sharesAmount = stageAvailableShares.add(2)
        const companySharesBefore = await object.companyShares()
        await object.connect(ownersMultisigImpersonated).buySharesForCompany(sharesAmount)
        const companySharesAfter = await object.companyShares()
        assert(
          companySharesAfter.eq(companySharesBefore.add(stageAvailableShares)),
          `company not recived shares!`,
        )
      })

      it('Regular: ownersMultisig buySharesForCompany all stage supply', async () => {
        const availableShares = await object.stageAvailableShares(stageId)
        const companySharesBefore = await object.companyShares()

        const objectBalancesBefore = []
        const treasuryBalancesBefore = []
        for (const payToken of payTokens) {
          objectBalancesBefore.push(await payToken.balanceOf(object.address))
          treasuryBalancesBefore.push(await payToken.balanceOf(treasury.address))
        }

        await object.connect(ownersMultisigImpersonated).buySharesForCompany(availableShares)
        const companySharesAfter = await object.companyShares()

        const treasuryBalancesAfter = []
        for (const payToken of payTokens) {
          treasuryBalancesAfter.push(await payToken.balanceOf(treasury.address))
        }

        assert(
          companySharesAfter.eq(companySharesBefore.add(availableShares)),
          'company not recived shares!',
        )

        for (let i = 0; i < payTokens.length; i++) {
          assert(
            treasuryBalancesAfter[i].eq(treasuryBalancesBefore[i].add(objectBalancesBefore[i])),
            'treasury not recived tokens!',
          )
        }
      })

      it('Error: not ownersMultisig buySharesForCompany', async () => {
        const sharesAmount = 7
        await expect(
          object.connect(administrator).buySharesForCompany(sharesAmount),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig withdrawCompanyShares', async () => {
        const companySharesAmount = 7
        await object.connect(ownersMultisigImpersonated).buySharesForCompany(companySharesAmount)

        const withdrawSharesAmount = 5
        const virtualPrice = ethers.utils.parseUnits('789', 18)
        const userNftBalanceBefore = await object.balanceOf(user.address)
        const companySharesBefore = await object.companyShares()
        await object
          .connect(ownersMultisigImpersonated)
          .withdrawCompanyShares(withdrawSharesAmount, user.address, virtualPrice)
        const companySharesAfter = await object.companyShares()
        const userNftBalanceAfter = await object.balanceOf(user.address)

        assert(userNftBalanceAfter.eq(userNftBalanceBefore.add(1)), 'user not recived nft!')

        const nftId = userNftBalanceAfter
        assert((await object.tokenBuyPrice(nftId)).eq(virtualPrice), 'virtualPrice not setted!')

        assert(
          companySharesAfter.eq(companySharesBefore.sub(withdrawSharesAmount)),
          'company not recived shares!',
        )
      })

      it('Error: not ownersMultisig withdrawCompanyShares', async () => {
        const sharesAmount = 7
        await expect(
          object.connect(administrator).withdrawCompanyShares(sharesAmount, user.address, 0),
        ).to.be.revertedWith('only owners multisig!')
      })

      it('Regular: ownersMultisig closeSale', async () => {
        await object.connect(ownersMultisigImpersonated).closeSale()
        assert((await object.isActiveSale()) == false, 'sale not closed')
        const nowTimestamp = (await ethers.provider.getBlock('latest')).timestamp
        assert(
          (await object.stageSaleStopTimestamp(stageId)).lte(nowTimestamp),
          'stageSaleStopTimestamp not updated',
        )
      })

      it('Error: not ownersMultisig closeSale', async () => {
        await expect(object.connect(administrator).closeSale()).to.be.revertedWith(
          'only owners multisig!',
        )
      })

      it('Regular: ownersMultisig setSaleStopTimestamp', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 50
        await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, timestamp)

        assert(
          (await object.stageSaleStopTimestamp(stageId)).lte(timestamp),
          'stageSaleStopTimestamp not updated',
        )

        await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 0)
        assert(
          (await object.stageSaleStopTimestamp(stageId)).eq(0),
          'stageSaleStopTimestamp not deleted',
        )
      })

      it('Error: not ownersMultisig setSaleStopTimestamp', async () => {
        const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 50
        await expect(
          object.connect(administrator).setSaleStopTimestamp(stageId, timestamp),
        ).to.be.revertedWith('only owners multisig!')
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

      it('requireTokenReady', async () => {
        await expect(object.requireTokenReady(tokenId)).to.be.revertedWith('stage not ready!')
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        await object.requireTokenReady(tokenId)
      })

      it('requireStageReady', async () => {
        await expect(object.requireStageReady(0)).to.be.revertedWith('stage not exists!')
        await expect(object.requireStageReady(100)).to.be.revertedWith('stage not exists!')
        await expect(object.requireStageReady(stageId)).to.be.revertedWith('stage not ready!')
        await object.connect(ownersMultisigImpersonated).closeStage(stageId)
        await object.requireStageReady(stageId)
      })

      describe('Exit', () => {
        it('Regalar exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

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
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await expect(object.connect(administrator).exit(tokenId)).to.be.revertedWith(
            'only token owner!',
          )
        })

        it('Error double exit', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await object.connect(user).exit(tokenId)
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'ERC721: invalid token ID',
          )
        })

        it('Error exit: sale stop timestamp disabled', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 0)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: sale stop timestamp not expired', async () => {
          const timestamp = (await ethers.provider.getBlock('latest')).timestamp + 1000
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, timestamp)

          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith(
            'cant exit with active sale!',
          )
        })

        it('Error exit: paused', async () => {
          await object.connect(ownersMultisigImpersonated).setSaleStopTimestamp(stageId, 1)

          await pause.connect(administrator).pause()
          await expect(object.connect(user).exit(tokenId)).to.be.revertedWith('paused!')
        })
      })
    })
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
