import { task } from "hardhat/config";
import { LAYERZEROV2_ENDPOINT } from "../../constants/layerzeroV2Endpoint";
import { WrappedTokenBridge } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { getTokenAddressFromDeployment } from "../../utils/getTokenAddress";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "registerWrappedToken",
  "Registers token on wrapped token bridge"
)
  .addPositionalParam("wrappedNetwork", "Wrapped network name")
  .addPositionalParam("wrappedTokenAddress", "Wrapped token address / ticker")
  .addPositionalParam("originalNetwork", "Original network name")
  .addPositionalParam("originalTokenAddress", "Original token address / ticker")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    let {
      wrappedNetwork,
      wrappedTokenAddress,
      originalNetwork,
      originalTokenAddress,
    } = taskArgs;

    const wrappedSigner = await getSigner("deployer", wrappedNetwork, hre);
    console.log(`Signer: ${wrappedSigner.address}`);

    const wrappedTokenBridge = (await getDeployedContract(
      "WrappedTokenBridge_Proxy",
      wrappedNetwork,
      wrappedSigner,
      { fetchImplementation: true }
    )) as WrappedTokenBridge;

    const remoteEid = LAYERZEROV2_ENDPOINT[originalNetwork].id;
    if (remoteEid === undefined) {
      throw new Error(`Invalid remote network ${originalNetwork}`);
    }

    wrappedTokenAddress = await getTokenAddressFromDeployment(
      wrappedTokenAddress,
      wrappedNetwork
    );

    originalTokenAddress = await getTokenAddressFromDeployment(
      originalTokenAddress,
      originalNetwork
    );

    console.log(
      `Registering token on ${wrappedNetwork} WrappedTokenBridge. \n
    Token (wrapped): ${wrappedTokenAddress} \n
    Token (original): ${originalTokenAddress} \n
    Original network: ${originalNetwork} \n`
    );

    await waitForConfirmation();

    const response = await wrappedTokenBridge.registerToken(
      wrappedTokenAddress,
      remoteEid,
      originalTokenAddress
    );
    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Registered`);
    }
  });
