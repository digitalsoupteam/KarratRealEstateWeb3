import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { DeployFunction } from 'hardhat-deploy/types'
import { AddressBook__factory } from '../typechain-types'

const deploy: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { ethers, deployments } = hre
  const { deploy, get, getOrNull } = deployments

  const alreadyDeployed = (await getOrNull('AdministratorFund')) != null
  if (alreadyDeployed) return

  const signers = await ethers.getSigners()
  const deployer = signers[0]

  const AddressBookDeployment = await get('AddressBook')
  const EarningsPoolDeployment = await get('EarningsPool')
  const BuyBackFundDeployment = await get('BuyBackFund')
  const ReferralProgramDeployment = await get('ReferralProgram')

  const recipients = [
    EarningsPoolDeployment.address,
    BuyBackFundDeployment.address,
    ReferralProgramDeployment.address,
  ]
  const dailyLimits = [
    ethers.utils.parseUnits('1000000', 18),
    ethers.utils.parseUnits('1000000', 18),
    ethers.utils.parseUnits('1000000', 18),
  ]

  const deployment = await deploy('AdministratorFund', {
    contract: 'AdministratorFund',
    from: deployer.address,
    proxy: {
      proxyContract: 'UUPS',
      execute: {
        init: {
          methodName: 'initialize',
          args: [
            AddressBookDeployment.address, // _addressBook
            recipients, // _recipients
            dailyLimits, // _dailyLimits
          ],
        },
      },
    },
  })

  await (
    await AddressBook__factory.connect(
      AddressBookDeployment.address,
      deployer,
    ).initialSetAdministratorFund(deployment.address)
  ).wait(1)
}

deploy.tags = ['AdministratorFund']
deploy.dependencies = ['ReferralProgram']
export default deploy
