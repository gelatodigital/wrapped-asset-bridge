import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { setTimeout } from "timers/promises";
import {
  abi as FiatTokenProxyAbi,
  creationCode as FiatTokenProxyCreationCode,
} from "../../constants/FiatTokenProxy.json";
import { create2Deploy } from "../../scripts/create2Deploy";
import { getDeployment } from "../../scripts/getDeployment";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  console.log(
    `Deploying FiatTokenProxy to ${network.name}. Hit ctrl + c to abort`
  );

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    const fiatTokenV2_2 = await getDeployment(`FiatTokenV2_2`, network.name);

    /**
     * Replace constructor in creation code.
     * In FiatTokenProxy.sol :
     * constructor(address implementationContract)
     */

    const fiatTokenProxyCreationCodeUpdated =
      FiatTokenProxyCreationCode.slice(0, -40) + fiatTokenV2_2.address.slice(2);

    console.log(`Deployer: ${deployer}`);
    console.log(`FiatTokenV2_2 address: ${fiatTokenV2_2.address}`);

    await setTimeout(10000);

    await create2Deploy("FiatTokenProxy", [], deployerSigner, {
      creationCode: fiatTokenProxyCreationCodeUpdated,
      abi: FiatTokenProxyAbi,
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

func.tags = ["CREATE2-FiatTokenProxy"];
