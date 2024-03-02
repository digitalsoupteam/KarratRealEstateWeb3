import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('ReferralProgram')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')

  const rewardsRatio = 100 // 1%

  const deployment = await deploy('ReferralProgram', {
    contract: 'ReferralProgram',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            rewardsRatio, // _rewardsRatio
          ],
        },
      },
    },
  })

  await (
    await AddressBook__factory.connect(AddressBookDeployment.address, deployer).initialSetReferralProgram(
      deployment.address,
    )
  ).wait(1)
  
}

deploy.tags = ['ReferralProgram']
deploy.dependencies = ['BuyBackFund']
export default deploy
