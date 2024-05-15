import { task } from "hardhat/config";
import { USDCMock } from "../../typechain";
import { getDeployedContract, getDeployment } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task("approve", "Sets ERC20 allowance of bridge")
  .addPositionalParam("networkName", "Network name")
  .addPositionalParam(
    "bridge",
    "OriginalTokenBridge/WrappedTokenBridge to set allowance for"
  )
  .addPositionalParam("token", "Token contract name")
  .addPositionalParam("amount", "Amount to approve")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const { networkName, bridge, token, amount } = taskArgs;

    const signer = await getSigner("dev", networkName, hre);
    console.log(`Signer: ${signer.address}`);

    const deploymentInfo = await getDeployment(`${bridge}_Proxy`, networkName);

    const tokenContract = (await getDeployedContract(
      token,
      networkName,
      signer
    )) as USDCMock;
    const decimals = await tokenContract.decimals();
    const amountToApprove = ethers.utils.parseUnits(amount, decimals);

    console.log(`Setting allowance of ${bridge} to ${amount} ${token}`);

    await waitForConfirmation();

    const response = await tokenContract.approve(
      deploymentInfo.address,
      amountToApprove
    );

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Allowance set`);
    }
  });
