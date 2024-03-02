import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('OwnersMultisig')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const owners = ['0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f', '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720']
  
  const deployment = await deploy('OwnersMultisig', {
    contract: 'MultisigWallet',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            owners.length, // _requiredSigners,
            owners, // _signers
          ],
        },
      },
    },
  })
}

deploy.tags = ['OwnersMultisig']
export default deploy
