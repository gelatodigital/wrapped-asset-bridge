import { task } from "hardhat/config";
import { LAYERZEROV2_ENDPOINT } from "../../constants/layerzeroV2Endpoint";
import { OriginalTokenBridge } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task("setRemoteEid", "Set remote lz eid on OriginalTokenBridge")
  .addPositionalParam("remoteNetwork", "Remote network name")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const { remoteNetwork } = taskArgs;

    const [signer] = await ethers.getSigners();
    console.log(`Signer: ${signer.address}`);

    const originalTokenBridge = (await getDeployedContract(
      "OriginalTokenBridge_Proxy",
      hre.network.name,
      signer,
      { fetchImplementation: true }
    )) as OriginalTokenBridge;

    const remoteEid = LAYERZEROV2_ENDPOINT[remoteNetwork].id;
    if (remoteEid === undefined) {
      throw new Error(`LZ endpoint info not found for ${remoteNetwork}`);
    }

    console.log(
      `Setting remote eid of OriginalTokenBridge on ${hre.network.name} to ${remoteEid} (${remoteNetwork})`
    );

    await waitForConfirmation();

    const response = await originalTokenBridge.setRemoteEid(remoteEid);

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Remote eid set`);
    }
  });
