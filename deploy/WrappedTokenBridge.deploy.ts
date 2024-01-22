import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setTimeout } from "timers/promises";
import LZ_ENDPOINTS from "../constants/layerzeroEndpoints.json";
import { create2Deploy } from "../scripts/create2Deploy";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  console.log(
    `Deploying WrappedTokenBridge to ${network.name}. Hit ctrl + c to abort`
  );

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    const ownerAddress = deployer; // Todo: update to true owner address
    const lzEndpointAddress = LZ_ENDPOINTS[network.name];

    console.log(`Deployer: ${deployer}`);
    console.log(`[${network.name}] Owner Address: ${ownerAddress}`);
    console.log(`[${network.name}] Endpoint Address: ${lzEndpointAddress}`);

    await setTimeout(10000);

    const initData = (
      await hre.ethers.getContractFactory("WrappedTokenBridge")
    ).interface.encodeFunctionData("initialize", []);

    await create2Deploy(
      "WrappedTokenBridge",
      [lzEndpointAddress],
      deployerSigner,
      {
        proxy: { type: "EIP173Proxy2StepWithReceive", ownerAddress, initData },
      }
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.log(error);
  }
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  const shouldSkip = hre.network.name !== "hardhat";
  return shouldSkip;
};

func.tags = ["CREATE2-WrappedTokenBridge"];
