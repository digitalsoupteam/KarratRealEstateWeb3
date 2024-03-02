import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'
import { CHAINLINK_USDC, CHAINLINK_USDCe, CHAINLINK_USDT, USDC, USDCe, USDT } from '../constants/addresses'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('PricersManager')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')

  const tokens = [USDT, USDC, USDCe]
  const pricers = [CHAINLINK_USDT, CHAINLINK_USDC, CHAINLINK_USDCe]

  const deployment = await deploy('PricersManager', {
    contract: 'PricersManager',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            tokens, // _tokens
            pricers, // _pricers
          ],
        },
      },
    },
  })

  await (
    await AddressBook__factory.connect(AddressBookDeployment.address, deployer).initialSetPricersManager(
      deployment.address,
    )
  ).wait(1)
  
}

deploy.tags = ['PricersManager']
deploy.dependencies = ['Pause']
export default deploy
