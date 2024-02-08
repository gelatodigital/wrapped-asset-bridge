import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Creates a JsonRpcProvider from hardhat config.
 * Useful for multichain hardhat task/scripts.
 */
export const getProvider = async (
  network: string,
  hre: HardhatRuntimeEnvironment
) => {
  hre = hre ?? (await import("hardhat"));
  const { ethers } = hre;
  const jsonRpcUrl = (hre.config.networks[network] as any).url;

  if (!jsonRpcUrl)
    throw new Error(
      `Failed to create provider: No RPC url for network ${network}`
    );

  const provider = new ethers.providers.JsonRpcProvider(jsonRpcUrl);
  return provider;
};
