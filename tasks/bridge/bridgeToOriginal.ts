import lzV2Utils from "@layerzerolabs/lz-v2-utilities";
import { task } from "hardhat/config";
import { LAYERZEROV2_ENDPOINT } from "../../constants/layerzeroV2Endpoint";
import { USDCMock, WrappedTokenBridge } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "bridgeToOriginal",
  "Bridge from Wrapped network to Original network"
)
  .addPositionalParam("wrappedNetwork", "Wrapped network")
  .addPositionalParam("originalNetwork", "Original network")
  .addPositionalParam("token", "Token contract name")
  .addPositionalParam("amount", "Amount to bridge")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const { wrappedNetwork, originalNetwork, token, amount } = taskArgs;

    const wrappedSigner = await getSigner("dev", wrappedNetwork, hre);
    console.log(`Signer: ${wrappedSigner.address}`);

    const originalEid = LAYERZEROV2_ENDPOINT[originalNetwork].id;
    if (originalEid === undefined) {
      throw new Error(`LZ endpoint info not found for ${originalNetwork}`);
    }

    const wrappedTokenBridge = (await getDeployedContract(
      "WrappedTokenBridge_Proxy",
      wrappedNetwork,
      wrappedSigner,
      { fetchImplementation: true }
    )) as WrappedTokenBridge;
    const tokenContract = (await getDeployedContract(
      token,
      wrappedNetwork,
      wrappedSigner
    )) as USDCMock;
    const decimals = await tokenContract.decimals();
    const amountToBridge = ethers.utils.parseUnits(amount, decimals);

    console.log(
      `Bridging ${amount} ${token} from ${wrappedNetwork} to ${originalNetwork}`
    );

    // https://docs.layerzero.network/contracts/options
    const originalGasLimit = 400_000;
    const originalMsgValue = 0;
    const options = lzV2Utils.Options.newOptions()
      .addExecutorLzReceiveOption(originalGasLimit, originalMsgValue)
      .toHex();

    // Estimate bridging fee in native token.
    const { nativeFee } = await wrappedTokenBridge.quote(
      originalEid,
      false,
      options
    );
    const nativeFeeWithAddend = nativeFee.mul(150).div(100);

    console.log(
      `Bridging fee in native: ${ethers.utils.formatEther(
        nativeFeeWithAddend
      )} (${nativeFeeWithAddend})`
    );

    const signerBalance = await wrappedSigner.getBalance();
    if (signerBalance.lt(nativeFee)) {
      console.error(`Insufficient native funds to pay for bridging fee.`);
    }

    await waitForConfirmation();

    const response = await wrappedTokenBridge.bridge(
      tokenContract.address,
      originalEid,
      amountToBridge,
      wrappedSigner.address,
      false,
      options,
      wrappedSigner.address,
      { value: nativeFeeWithAddend }
    );

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Bridge tx sent: ${receipt.transactionHash}`);
    }
  });
