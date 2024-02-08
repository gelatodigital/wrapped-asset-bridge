import { ethers } from "ethers";
import { getDeployment } from "./getDeployment";

// Returns the address of token with token contract name as input
export const getTokenAddressFromDeployment = async (
  tokenAddressOrTicker: string,
  network: string
) => {
  try {
    ethers.utils.getAddress(tokenAddressOrTicker);

    return tokenAddressOrTicker;
  } catch {
    // Fetch deployed token if token contract name is passed
    const { address } = await getDeployment(tokenAddressOrTicker, network);
    return address;
  }
};
