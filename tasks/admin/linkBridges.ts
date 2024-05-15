import { TransactionResponse } from "@ethersproject/abstract-provider";
import { task } from "hardhat/config";
import { LAYERZEROV2_ENDPOINT } from "../../constants/layerzeroV2Endpoint";
import { OriginalTokenBridge, WrappedTokenBridge } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "linkBridges",
  "Sets up peers of OriginalTokenBridge & WrappedTokenBridge"
)
  .addParam("original", "Original network")
  .addParam("wrapped", "Wrapped network")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const originalNetwork = taskArgs.original;
    const wrappedNetwork = taskArgs.wrapped;

    const originalSigner = await getSigner("deployer", originalNetwork, hre);
    const wrappedSigner = await getSigner("deployer", wrappedNetwork, hre);
    console.log(`Signer: ${originalSigner.address}`);

    const originalEid = LAYERZEROV2_ENDPOINT[originalNetwork].id;
    const wrappedEid = LAYERZEROV2_ENDPOINT[wrappedNetwork].id;
    if (originalEid === undefined || wrappedEid === undefined) {
      throw new Error(
        `LZ endpoint info not found for ${originalNetwork}/${wrappedNetwork}`
      );
    }

    const originalTokenBridge = (await getDeployedContract(
      "OriginalTokenBridge_Proxy",
      originalNetwork,
      originalSigner,
      { fetchImplementation: true }
    )) as OriginalTokenBridge;
    const wrappedTokenBridge = (await getDeployedContract(
      "WrappedTokenBridge_Proxy",
      wrappedNetwork,
      wrappedSigner,
      { fetchImplementation: true }
    )) as WrappedTokenBridge;

    const newPeerOfOriginal = ethers.utils.hexZeroPad(
      wrappedTokenBridge.address,
      32
    );
    const newPeerOfWrapped = ethers.utils.hexZeroPad(
      originalTokenBridge.address,
      32
    );

    const peerOfOriginal = await originalTokenBridge.peers(wrappedEid);

    console.log(
      `Updating peer of originalTokenBridge on ${originalNetwork} \n
      from: ${peerOfOriginal} \n
      to: ${newPeerOfOriginal}\n`
    );

    const setPeerForOrig = async () => {
      const response1 = (await originalTokenBridge.setPeer(
        wrappedEid,
        newPeerOfOriginal
      )) as TransactionResponse;

      const receipt1 = await response1.wait();
      if (receipt1.status && receipt1.status === 1) {
        console.log(`✅ Updated peer of originalTokenBridge`);
      }
    };

    await waitForConfirmation(setPeerForOrig);

    const peerOfWrapped = await wrappedTokenBridge.peers(originalEid);
    console.log(
      `Updating peer of wrappedTokenBridge on ${wrappedNetwork} \n
      from: ${peerOfWrapped} \n
      to: ${newPeerOfWrapped}\n`
    );

    const setPeerForWrap = async () => {
      const response2 = (await wrappedTokenBridge.setPeer(
        originalEid,
        newPeerOfWrapped
      )) as TransactionResponse;

      const receipt2 = await response2.wait();
      if (receipt2.status && receipt2.status === 1) {
        console.log(`✅ Updated peer of wrappedTokenBridge`);
      }
    };

    await waitForConfirmation(setPeerForWrap);
  });
