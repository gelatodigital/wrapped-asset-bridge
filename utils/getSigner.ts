import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getProvider } from "./getProvider";

/**
 * Creates a Wallet signer from hardhat config.
 * Useful for multichain hardhat task/scripts.
 */
export const getSigner = async (
  signerName: string,
  network: string,
  hre: HardhatRuntimeEnvironment
) => {
  hre = hre ?? (await import("hardhat"));
  const { ethers } = hre;

  const indexOfSigner = hre.config.namedAccounts[signerName] as number;

  if (indexOfSigner == undefined) {
    throw new Error(`Invalid signer name ${signerName}`);
  }

  const accounts = hre.config.networks[network].accounts as string[];

  const pk = accounts[indexOfSigner];
  if (!pk) {
    throw new Error(`PK of named signer "${signerName}" not found`);
  }

  const provider = await getProvider(network, hre);
  const wallet = new ethers.Wallet(pk, provider);
  return wallet;
};
