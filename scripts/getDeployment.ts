import { TransactionReceipt } from "@ethersproject/abstract-provider";

interface DeploymentInfo {
  address: string;
  transactionHash: string;
  args: any[];
  salt: string;
  receipt: TransactionReceipt;
  abi: any[];
}

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
