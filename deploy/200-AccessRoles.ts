import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('AccessRoles')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const OwnersMultisigDeployment = await get('OwnersMultisig')

  const administrators = [
    '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'
  ]

  const deployment = await deploy('AccessRoles', {
    contract: 'AccessRoles',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            OwnersMultisigDeployment.address, // _ownersMultisig
            administrators, // _administrators
          ],
        },
      },
    },
  })
}

deploy.tags = ['AccessRoles']
deploy.dependencies = ['OwnersMultisig']
export default deploy
