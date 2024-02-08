import { task } from "hardhat/config";
import { USDCMock } from "../../typechain";
import { getDeployedContract } from "../../utils/getDeployment";
import { getSigner } from "../../utils/getSigner";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task("mint", "Mints mock ERC20 token")
  .addPositionalParam("networkName", "Network name")
  .addPositionalParam("token", "Token contract name")
  .addPositionalParam("amount", "Amount to mint")
  .addOptionalParam("address", "Address to mint to")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const { networkName, token, address, amount } = taskArgs;

    const signer = await getSigner("dev", networkName, hre);
    console.log(`Signer: ${signer.address}`);

    const tokenContract = (await getDeployedContract(
      token,
      networkName,
      signer
    )) as USDCMock;

    const decimals = await tokenContract.decimals();
    const amountToMint = ethers.utils.parseUnits(amount, decimals);
    const addressToMintTo = address ?? signer.address;

    console.log(`Minting ${amount} ${token} to ${addressToMintTo}`);

    await waitForConfirmation();

    const response = await tokenContract.mint(addressToMintTo, amountToMint);

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Minted`);
    }
  });
