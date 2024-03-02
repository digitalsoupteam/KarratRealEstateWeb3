import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('BuyBackFund')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')

  const deployment = await deploy('BuyBackFund', {
    contract: 'BuyBackFund',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
          ],
        },
      },
    },
  })

  await (
    await AddressBook__factory.connect(AddressBookDeployment.address, deployer).initialSetBuyBackFund(
      deployment.address,
    )
  ).wait(1)
  
}

deploy.tags = ['BuyBackFund']
deploy.dependencies = ['EarningsPool']
export default deploy
