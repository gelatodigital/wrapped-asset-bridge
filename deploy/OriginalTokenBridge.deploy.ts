import { ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setTimeout } from "timers/promises";
import LZ_ENDPOINTS from "../constants/layerzeroEndpoints.json";
import REMOTE_CHAIN_IDS from "../constants/remoteChainIds.json";
import WETHS from "../constants/weths.json";
import { create2Deploy } from "../scripts/create2Deploy";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { network } = hre;

  if (network.name !== "hardhat") {
    console.log(
      `Deploying OriginalTokenBridge to ${network.name}. Hit ctrl + c to abort`
    );
  }

  const { deployer } = await hre.getNamedAccounts();
  const deployerSigner = await hre.ethers.getSigner(deployer);

  try {
    const ownerAddress = deployer; // Todo: update to true owner address
    const lzEndpointAddress = LZ_ENDPOINTS[hre.network.name];
    const remoteChainId = REMOTE_CHAIN_IDS[hre.network.name];
    const weth = WETHS[hre.network.name];

    console.log(`Deployer: ${deployer}`);
    console.log(`[${hre.network.name}] Owner Address: ${ownerAddress}`);
    console.log(`[${hre.network.name}] Endpoint Address: ${lzEndpointAddress}`);
    console.log(`[${hre.network.name}] Remote Chain Id: ${remoteChainId}`);
    console.log(`[${hre.network.name}] WETH Address: ${weth}`);

    await setTimeout(10000);

    const initData = (
      await ethers.getContractFactory("OriginalTokenBridge")
    ).interface.encodeFunctionData("initialize", [remoteChainId]);

    await create2Deploy(
      "OriginalTokenBridge",
      [lzEndpointAddress, weth],
      deployerSigner,
      {
        proxy: { type: "EIP173Proxy2StepWithReceive", ownerAddress, initData },
      }
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

func.tags = ["CREATE2-OriginalTokenBridge"];
