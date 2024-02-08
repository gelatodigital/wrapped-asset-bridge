import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { create2Deploy } from "../utils/create2Deploy";
import { waitForConfirmation } from "../utils/waitForConfirmation";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  if (network.name !== "hardhat") {
    console.log(
      `Deploying USDCMock to ${network.name}. Hit ctrl + c to abort\n`
    );
  }

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    console.log(`Deployer: ${deployer}`);

    await waitForConfirmation();

    await create2Deploy("USDCMock", ["USDCMock", "UDSC", 6], deployerSigner);
  } catch (error) {
    const e = error as Error;
    console.error(`Error: ${e.message}`);
  }
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip = hre.network.name !== "hardhat";
  return shouldSkip;
};

func.tags = ["USDCMock"];
