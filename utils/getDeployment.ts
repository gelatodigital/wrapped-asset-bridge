import { Provider, TransactionReceipt } from "@ethersproject/abstract-provider";
import { Contract, Signer, ethers } from "ethers";

interface DeploymentInfo {
  address: string;
  transactionHash: string;
  args: any[];
  salt: string;
  receipt: TransactionReceipt;
  abi: any[];
}

/**
 * Fetches deployed contract information from deployment files.
 */
export const getDeployment = async (
  deploymentName: string,
  network: string
): Promise<DeploymentInfo> => {
  let info: any;

  try {
    info = await import(
      `../deployments/${network}/${deploymentName}-latest.json`
    );
  } catch (error) {
    throw new Error(`${deploymentName} is not deployed on ${network}`);
  }
  if (!info.address) {
    throw new Error(`${deploymentName} is not deployed on ${network}`);
  }

  return info as DeploymentInfo;
};

/**
 * Creates a Contract instance of a deployed contract from deployment files.
 * Set args.fetchImplementation = true to fetch proxied contracts with abi of implementation.
 */
export const getDeployedContract = async (
  deploymentName: string,
  network: string,
  signerOrProvider?: Signer | Provider,
  args?: {
    fetchImplementation?: boolean;
  }
): Promise<Contract> => {
  const { address, abi } = await getDeployment(deploymentName, network);

  if (deploymentName.includes(`_Proxy`) && args?.fetchImplementation) {
    const implementationDeploymentInfo = await getDeployment(
      deploymentName.replace(`_Proxy`, ""),
      network
    );

    return new ethers.Contract(
      address,
      implementationDeploymentInfo.abi,
      signerOrProvider
    );
  }

  return new ethers.Contract(address, abi, signerOrProvider);
};
