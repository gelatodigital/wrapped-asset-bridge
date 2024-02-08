import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DEPLOYER_ADDRESS, LAYERZEROV2_ENDPOINT } from "../constants";
import { create2Deploy } from "../utils/create2Deploy";
import { waitForConfirmation } from "../utils/waitForConfirmation";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network, ethers } = hre;

  console.log(
    `Deploying WrappedTokenBridge to ${network.name}. Hit ctrl + c to abort\n`
  );

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

    console.log(`Deployer: ${deployer}`);
    console.log(`Owner Address: ${ownerAddress}`);
    console.log(`Endpoint Address: ${lzEndpointAddress}`);

    const initData = (
      await ethers.getContractFactory("WrappedTokenBridge")
    ).interface.encodeFunctionData("initialize", []);

    await waitForConfirmation();

    await create2Deploy(
      "WrappedTokenBridge",
      [lzEndpointAddress],
      deployerSigner,
      {
        proxy: {
          type: "EIP173Proxy2StepWithCustomReceive",
          ownerAddress,
          initData,
          salt: "WrappedTokenBridge",
        },
      }
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.log(error);
  }
};

export default func;

// func.skip = async (hre: HardhatRuntimeEnvironment) => {
//   const shouldSkip = hre.network.name !== "hardhat";
//   return shouldSkip;
// };

func.tags = ["WrappedTokenBridge"];
