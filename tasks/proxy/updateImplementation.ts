import { task } from "hardhat/config";
import { EIP173Proxy } from "../../typechain";
import { getDeployedContract, getDeployment } from "../../utils/getDeployment";
import { waitForConfirmation } from "../../utils/waitForConfirmation";

export default task(
  "updateImplementation",
  "Updates implementation of proxy contract"
)
  .addPositionalParam("contract", "Contract name")
  .addOptionalParam("address", "Manually set address of implementation")
  .setAction(async (taskArgs, hre) => {
    const { ethers } = hre;

    const contractName = taskArgs.contract;

    const [signer] = await ethers.getSigners();

    const proxyContract = (await getDeployedContract(
      `${contractName}_Proxy`,
      hre.network.name,
      signer
    )) as EIP173Proxy;

    const latestImplementation = await getDeployment(
      contractName,
      hre.network.name
    );

    const addressToUpdate = taskArgs.address ?? latestImplementation.address;

    console.log(
      `Updating implementation of ${contractName}_Proxy to ${addressToUpdate}`
    );

    await waitForConfirmation();

    const response = await proxyContract.upgradeTo(addressToUpdate);

    const receipt = await response.wait();
    if (receipt.status && receipt.status === 1) {
      console.log(`✅ Updated`);
    }
  });
