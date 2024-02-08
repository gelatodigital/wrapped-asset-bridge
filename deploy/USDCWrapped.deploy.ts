import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { create2Deploy } from "../utils/create2Deploy";
import { getDeployment } from "../utils/getDeployment";
import { waitForConfirmation } from "../utils/waitForConfirmation";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  if (network.name !== "hardhat") {
    console.log(
      `Deploying USDCWrapped to ${network.name}. Hit ctrl + c to abort\n`
    );
  }

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    const wrappedTokenBridge = await getDeployment(
      "WrappedTokenBridge_Proxy",
      network.name
    );

    console.log(`Deployer: ${deployer}`);
    console.log(`WrappedTokenBridge: ${wrappedTokenBridge.address}`);

    await waitForConfirmation();

    await create2Deploy(
      "USDCWrapped",
      [wrappedTokenBridge.address],
      deployerSigner
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip = hre.network.name !== "hardhat";
  return shouldSkip;
};

func.tags = ["USDCWrapped"];
