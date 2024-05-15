import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DEPLOYER_ADDRESS, LAYERZEROV2_ENDPOINT, WETHS } from "../constants";
import { create2Deploy } from "../utils/create2Deploy";
import { getDeployment } from "../utils/getDeployment";
import { waitForConfirmation } from "../utils/waitForConfirmation";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network, ethers } = hre;

  if (network.name !== "hardhat") {
    console.log(
      `Deploying OriginalTokenBridge to ${network.name}. Hit ctrl + c to abort\n`
    );
  }

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await ethers.getSigner(deployer);

  if (deployer != DEPLOYER_ADDRESS) {
    throw new Error(
      `Deployer is not expected deployer. Check DEPLOYER_PK in .env`
    );
  }

  try {
    const ownerAddress = DEPLOYER_ADDRESS;
    const lzEndpointAddress = LAYERZEROV2_ENDPOINT[network.name].address;
    const remoteNetwork = "unreal"; // Todo: update accordingly
    const remoteEid = LAYERZEROV2_ENDPOINT[remoteNetwork].id;
    const weth =
      WETHS[network.name] ??
      (await getDeployment("WETH9", network.name)).address;

    console.log(`Deployer: ${deployer}`);
    console.log(`Owner Address: ${ownerAddress}`);
    console.log(`Remote Network: ${remoteNetwork}`);
    console.log(`Remote Chain Id: ${remoteEid}`);
    console.log(`Endpoint Address: ${lzEndpointAddress}`);
    console.log(`WETH Address: ${weth}`);

    const initData = (
      await ethers.getContractFactory("OriginalTokenBridge")
    ).interface.encodeFunctionData("initialize", [remoteEid]);

    await waitForConfirmation();

    await create2Deploy(
      "OriginalTokenBridge",
      [lzEndpointAddress, weth],
      deployerSigner,
      {
        proxy: {
          type: "EIP173Proxy2StepWithCustomReceive",
          ownerAddress,
          initData,
          salt: "OriginalTokenBridge",
        },
      }
    );
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

func.tags = ["OriginalTokenBridge"];
