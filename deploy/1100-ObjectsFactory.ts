import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory, AccessRoles__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('ObjectsFactory')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')
  const ObjectImplementationDeployment = await get('ObjectImplementation')

  const deployment = await deploy('ObjectsFactory', {
    contract: 'ObjectsFactory',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            ObjectImplementationDeployment.address, // _objectImplementation
          ],
        },
      },
    },
  })

  const addressBook = AddressBook__factory.connect(AddressBookDeployment.address, deployer)
  await (await addressBook.initialSetObjectsFactory(deployment.address)).wait(1)

  await (
    await AccessRoles__factory.connect(await addressBook.accessRoles(), deployer).renounceDeployer()
  ).wait(1)
}

deploy.tags = ['ObjectsFactory']
deploy.dependencies = ['ObjectImplementation']
export default deploy
