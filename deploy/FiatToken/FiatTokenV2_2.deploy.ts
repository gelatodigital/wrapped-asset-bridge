import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { setTimeout } from "timers/promises";
import {
  abi as FiatTokenV2_2Abi,
  creationCode as FiatTokenV2_2CreationCode,
} from "../../constants/FiatTokenV2_2.json";
import { create2Deploy } from "../../scripts/create2Deploy";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  console.log(
    `Deploying FiatTokenV2_2 to ${network.name}. Hit ctrl + c to abort`
  );

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    console.log(`Deployer: ${deployer}`);
    await setTimeout(10000);

    await create2Deploy("FiatTokenV2_2", [], deployerSigner, {
      creationCode: FiatTokenV2_2CreationCode,
      abi: FiatTokenV2_2Abi,
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip = hre.network.name !== "hardhat";
  return shouldSkip;
};

func.tags = ["CREATE2-FiatTokenV2_2"];
