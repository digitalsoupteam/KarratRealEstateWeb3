import 'dotenv/config'
import { HardhatUserConfig, task } from 'hardhat/config'

import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import 'hardhat-gas-reporter'
import 'hardhat-tracer'
import 'hardhat-abi-exporter'
import '@nomicfoundation/hardhat-chai-matchers'
import 'solidity-docgen'

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.18',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
        details: {
          yul: true,
        },
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      forking: {
        url: 'https://rpc.ankr.com/polygon',
        blockNumber: 50102046,
      },
      blockGasLimit: 30000000,
      accounts: {
        count: 10,
        accountsBalance: '1000000000000000000000000000',
      },
      loggingEnabled: false,
    },
    mumbai: {
      chainId: 80001,
      url: 'https://rpc.ankr.com/polygon_mumbai',
      accounts: [
        process.env.MUMBAI_DEPLOYER_PRIVATE_KEY ??
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      ],
    },
    mainnet: {
      chainId: 137,
      url: 'https://rpc.ankr.com/polygon',
      accounts: [
        process.env.MAINNET_DEPLOYER_PRIVATE_KEY ??
          '0x0000000000000000000000000000000000000000000000000000000000000000',
      ],
    },
  },
  docgen: {
    pages: 'files',
    exclude: ['./interfaces', './exports.sol'],
  },
  abiExporter: {
    path: './abi',
    except: ['./interfaces', './exports.sol'],
    flat: true,
  },
}

export default config
