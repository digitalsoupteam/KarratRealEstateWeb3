import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('ObjectImplementation')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const deployment = await deploy('ObjectImplementation', {
    contract: 'Object',
    from: deployer.address,
  })
}

deploy.tags = ['ObjectImplementation']
deploy.dependencies = ['AdministratorFund']
export default deploy
