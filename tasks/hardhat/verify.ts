import { task } from "hardhat/config";
import { getDeployment } from "../../utils/getDeployment";

// e.g.
export default task("verifyContract", "Verifies contract on etherscan")
  .addPositionalParam("deploymentname", "Contract name in deployment file.")
  .addOptionalPositionalParam(
    "contractname",
    "Contract name in contracts directory. Can be path."
  )
  .setAction(async (taskArgs, hre) => {
    const deploymentname = taskArgs.deploymentname;
    const contractname = taskArgs.contractname;

    const deploymentInfo = await getDeployment(
      `${deploymentname}`,
      hre.network.name
    );

    await hre.run("verify:verify", {
      contract: contractname,
      address: deploymentInfo.address,
      constructorArguments: deploymentInfo.args,
    });
  });
