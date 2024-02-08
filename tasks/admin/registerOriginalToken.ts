import { task } from "hardhat/config";
import { OriginalTokenBridge, USDCMock } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { getTokenAddressFromDeployment } from "../../utils/getTokenAddress";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "registerOriginalToken",
  "Registers token on original token bridge"
)
  .addPositionalParam("originalNetwork", "Original network")
  .addPositionalParam("tokenAddress", "Token address / ticker")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    let { originalNetwork, tokenAddress } = taskArgs;

    const originalSigner = await getSigner("deployer", originalNetwork, hre);
    console.log(`Signer: ${originalSigner.address}`);

    const originalTokenBridge = (await getDeployedContract(
      "OriginalTokenBridge_Proxy",
      originalNetwork,
      originalSigner,
      { fetchImplementation: true }
    )) as OriginalTokenBridge;

    tokenAddress = await getTokenAddressFromDeployment(
      tokenAddress,
      originalNetwork
    );

    const token = (await ethers.getContractAt(
      "USDCMock",
      tokenAddress,
      originalSigner
    )) as USDCMock;
    const decimals = await token.decimals();

    console.log(
      `Registering token on ${originalNetwork} OriginalTokenBridge. \n
    Token: ${tokenAddress} \n
    Decimals: ${decimals} \n`
    );

    await waitForConfirmation();

    const response = await originalTokenBridge.registerToken(
      tokenAddress,
      decimals
    );

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Registered`);
    }
  });
