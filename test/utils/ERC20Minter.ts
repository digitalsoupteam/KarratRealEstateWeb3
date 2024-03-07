import { ethers, network } from 'hardhat'
import { setBalance } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber } from 'ethers'
import { USDC, USDCe, USDT } from '../../constants/addresses'
import { IERC20Metadata__factory } from '../../typechain-types'

export default class ERC20Minter {
  public static async mint(
    tokenAddress: string,
    recipient: string,
    maxAmountFormated?: number,
  ) {
    if (tokenAddress == ethers.constants.AddressZero) {
      const amount = ethers.utils.parseUnits(`${maxAmountFormated}`, 18)
      await setBalance(recipient, amount)
      return amount
    }

    const holders: any = {
      [USDT]: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
      [USDC]: '0xF977814e90dA44bFA03b6295A0616a897441aceC',
      [USDCe]: '0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245',
    }

    const holderAddress = holders[tokenAddress]
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [holderAddress],
    })
    const holder = await ethers.getSigner(holderAddress)

    await setBalance(holderAddress, ethers.utils.parseEther('0.1'))

    const token = IERC20Metadata__factory.connect(tokenAddress, holder)
    const tokenDecimals = await token.decimals()
    const amount = ethers.utils.parseUnits(`${maxAmountFormated}`, tokenDecimals)

    const holderBalance = await token.balanceOf(holderAddress)

    if (holderBalance.lt(amount)) {
      throw 'ERC20Minter: holder balance < maxAmountFormated'
    }

    await (await token.transfer(recipient, amount)).wait()

    return amount;
  }
}
