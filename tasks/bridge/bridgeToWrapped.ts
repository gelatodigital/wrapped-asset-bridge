import lzV2Utils from "@layerzerolabs/lz-v2-utilities";
import { task } from "hardhat/config";
import { LAYERZEROV2_ENDPOINT } from "../../constants/layerzeroV2Endpoint";
import { OriginalTokenBridge, USDCMock } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "bridgeToWrapped",
  "Bridge from Original network to Wrapped network"
)
  .addPositionalParam("originalNetwork", "Original network")
  .addPositionalParam("wrappedNetwork", "Wrapped network")
  .addPositionalParam("token", "Token contract name")
  .addPositionalParam("amount", "Amount to bridge in 18dp")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const { wrappedNetwork, originalNetwork, token, amount } = taskArgs;

    const originalSigner = await getSigner("dev", originalNetwork, hre);
    console.log(`Signer: ${originalSigner.address}`);

    const wrappedEid = LAYERZEROV2_ENDPOINT[wrappedNetwork].id;
    if (wrappedEid === undefined) {
      throw new Error(`LZ endpoint info not found for ${wrappedNetwork}`);
    }

    const originalTokenBridge = (await getDeployedContract(
      "OriginalTokenBridge_Proxy",
      originalNetwork,
      originalSigner,
      { fetchImplementation: true }
    )) as OriginalTokenBridge;
    const tokenContract = (await getDeployedContract(
      token,
      originalNetwork,
      originalSigner
    )) as USDCMock;
    const decimals = await tokenContract.decimals();
    const amountToBridge = ethers.utils.parseUnits(amount, decimals);

    console.log(
      `Bridging ${amount} ${token} from ${originalNetwork} to ${wrappedNetwork}`
    );

    // https://docs.layerzero.network/contracts/options
    const wrappedGasLimit = 400_000;
    const wrappedMsgValue = 0;
    const options = lzV2Utils.Options.newOptions()
      .addExecutorLzReceiveOption(wrappedGasLimit, wrappedMsgValue)
      .toHex();

    // Estimate bridging fee in native token.
    const { nativeFee } = await originalTokenBridge.quote(
      wrappedEid,
      false,
      options
    );
    const nativeFeeWithAddend = nativeFee.mul(150).div(100);

    console.log(
      `Bridging fee in native: ${ethers.utils.formatEther(
        nativeFeeWithAddend
      )} (${nativeFeeWithAddend})`
    );

    const signerBalance = await originalSigner.getBalance();
    if (signerBalance.lt(nativeFeeWithAddend)) {
      console.error(`Insufficient native funds to pay for bridging fee.`);
    }

    await waitForConfirmation();

    const response = await originalTokenBridge.bridge(
      tokenContract.address,
      amountToBridge,
      originalSigner.address,
      options,
      originalSigner.address,
      { value: nativeFeeWithAddend }
    );

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Bridge tx sent: ${receipt.transactionHash}`);
    }
  });
