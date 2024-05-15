import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { existsSync, promises as fs } from "fs";
import hre from "hardhat";
import { CallOptions } from "hardhat-deploy/types";
import path from "path";
import { CREATE2_FACTORY_ADDRESS } from "../constants";
import { EIP173Proxy } from "../typechain";
import { getDeployment } from "./getDeployment";

const { ethers } = hre;
const { utils } = ethers;
const { hexZeroPad, hexlify, keccak256, hexConcat, toUtf8Bytes } = utils;

type ProxyOptionsBase = {
  type:
    | "EIP173Proxy2StepWithCustomReceive"
    | "EIP173Proxy2Step"
    | "EIP173ProxyWithCustomReceive"
    | "EIP173Proxy";
  ownerAddress: string;
  initData: string;
  implementationName?: string;
};

/**
 * If setImplementationOnDeploy = false|undefined, proxy will be
 * deployed with zero address as implementation address. Implementation will
 * be set after deployment.
 *
 * Salt must be provided when setImplementationOnDeploy = false|undefined
 */
type ProxyOptions = ProxyOptionsBase &
  (
    | {
        setImplementationOnDeploy: true;
        salt?: string;
      }
    | {
        setImplementationOnDeploy?: false;
        salt: string;
      }
  );

interface DeployOptions {
  salt?: string;
  proxy?: ProxyOptions;
  creationCode?: string; // Deploy with custom creation code instead of fetching from artifacts.
  abi?: any[]; // Manually inject abi into deployment file when custom creationCode is used.
}

/**
 * Deploys contract with create2 factory.
 */
export const create2Deploy = async (
  contractName: string,
  args: any[],
  deployer: SignerWithAddress,
  options?: DeployOptions,
  callOptions?: CallOptions
) => {
  options = options ?? {};

  const implementationAddress = await deployContract(
    contractName,
    args,
    deployer,
    options,
    callOptions
  );

  if (options.proxy && implementationAddress) {
    if (await isProxyDeployed(contractName, hre.network.name)) {
      console.log(
        `${contractName}_Proxy has already been deployed. Skipping...`
      );

      return;
    }

    options.proxy.implementationName = contractName;

    if (options.proxy.setImplementationOnDeploy) {
      // deploys and initialize proxy with implementation
      await deployContract(
        options.proxy.type,
        [
          implementationAddress,
          options.proxy.ownerAddress,
          options.proxy.initData,
        ],
        deployer,
        options,
        callOptions
      );
    } else {
      // deploys proxy with empty implementation
      const proxyAddress = await deployContract(
        options.proxy.type,
        [ethers.constants.AddressZero, options.proxy.ownerAddress, "0x"],
        deployer,
        options,
        callOptions
      );

      if (proxyAddress) {
        await setImplementation(
          proxyAddress,
          implementationAddress,
          options.proxy.initData,
          deployer
        );
      }
    }
  }
};

const deployContract = async (
  contractName: string,
  args: any[],
  deployer: SignerWithAddress,
  options: DeployOptions,
  callOptions?: CallOptions
): Promise<string | undefined> => {
  let creationCode: string;

  const isDeployingProxy = contractName === options.proxy?.type;

  if (options.creationCode) {
    creationCode = options.creationCode;
  } else {
    const contractFactory = await hre.ethers.getContractFactory(contractName);
    creationCode = getCreationCode(contractFactory, args);
  }

  let salt;
  if (isDeployingProxy && options.proxy?.salt) {
    salt = keccak256(toUtf8Bytes(options.proxy.salt));
    options.proxy.salt = salt;
  } else if (!isDeployingProxy && options.salt) {
    salt = keccak256(toUtf8Bytes(options.salt));
    options.salt = salt;
  } else {
    salt = ethers.constants.HashZero;
  }

  const deployedAddress = determineCreate2DeployedAddress(creationCode, salt);

  if (await isContractDeployed(deployedAddress)) {
    if (options.proxy) {
      console.log(
        `Contract ${contractName} already deployed at ${deployedAddress}`
      );
      console.log(`Deploying ${options.proxy.type} for ${contractName}...`);
      return deployedAddress;
    } else {
      throw new Error(
        `Contract ${contractName} already deployed at ${deployedAddress}`
      );
    }
  }

  console.log(`Deploying ${contractName} with CREATE2...`);
  const response = await sendCreate2Transaction(
    deployer,
    creationCode,
    salt,
    callOptions
  );
  const receipt = await response.wait();

  if (receipt.status === 1) {
    await saveDeploymentInfo(
      contractName,
      args,
      deployedAddress,
      receipt,
      options
    );

    return deployedAddress;
  }
};

const sendCreate2Transaction = async (
  deployer: SignerWithAddress,
  creationCode: string,
  salt: string,
  callOptions?: CallOptions
) => {
  const data = salt + creationCode.slice(2); // slice to remove "0x"
  return deployer.sendTransaction({
    to: CREATE2_FACTORY_ADDRESS,
    data,
    ...callOptions,
  });
};

const setImplementation = async (
  proxyAddress: string,
  implementationAddress: string,
  initData: string,
  signer: SignerWithAddress
) => {
  const proxy = (await ethers.getContractAt(
    "EIP173Proxy",
    proxyAddress,
    signer
  )) as EIP173Proxy;

  console.log(`Setting implementation post deployment...`);
  await proxy.upgradeToAndCall(implementationAddress, initData);
  console.log(`Implementation set`);
};

export const saveDeploymentInfo = async (
  contractName: string,
  args: any[],
  deployedAddress: string,
  txReceipt: TransactionReceipt,
  options: DeployOptions
) => {
  if (txReceipt.status && txReceipt.status !== 0) {
    const networkName = hre.network.name;
    const directoryPath = path.join(__dirname, "../deployments", networkName);

    await createDirectoryIfNotExists(directoryPath);
    await saveDeploymentFiles(
      contractName,
      args,
      deployedAddress,
      txReceipt,
      options,
      directoryPath
    );
  }
};

const saveDeploymentFiles = async (
  contractName: string,
  args: any[],
  deployedAddress: string,
  txReceipt: TransactionReceipt,
  options: DeployOptions,
  directoryPath: string
) => {
  const isDeployingProxy = contractName === options.proxy?.type;

  const timestamp = Math.floor(Date.now() / 1000);
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  const fileName = options.proxy?.implementationName
    ? `${options.proxy?.implementationName}_Proxy`
    : contractName;

  const timestampFilePath = path.join(
    directoryPath,
    `${fileName}-${timestamp}.json`
  );
  const latestFilePath = path.join(directoryPath, `${fileName}-latest.json`);
  const chainIdFilePath = path.join(directoryPath, ".chainId");

  let abi: any[] = [];

  if (options.abi) {
    abi = options.abi;
  } else {
    try {
      abi = (await hre.artifacts.readArtifact(contractName)).abi;
    } catch {}
  }

  const salt = isDeployingProxy ? options.proxy?.salt : options.salt;

  const deploymentInfo = {
    address: deployedAddress,
    transactionHash: txReceipt.transactionHash,
    args,
    receipt: txReceipt,
    salt,
    abi,
  };

  await fs.writeFile(
    timestampFilePath,
    JSON.stringify(deploymentInfo, null, 2)
  );
  await fs.writeFile(latestFilePath, JSON.stringify(deploymentInfo, null, 2));

  if (!existsSync(chainIdFilePath)) {
    await fs.writeFile(chainIdFilePath, chainId.toString());
  }

  console.log(`Deployment info saved to ${latestFilePath}`);
};

const getCreationCode = (contractFactory: any, args: any[]) => {
  const creationCode = contractFactory
    .getDeployTransaction(...args)
    .data?.toString();
  if (!creationCode) {
    throw new Error(
      "Unable to generate creation code. Check if contract name is valid."
    );
  }
  return creationCode;
};

export const determineCreate2DeployedAddress = (
  creationCode: string,
  salt: string
): string => {
  const saltBytes32 = hexZeroPad(hexlify(salt), 32);
  return (
    "0x" +
    keccak256(
      hexConcat([
        "0xff",
        CREATE2_FACTORY_ADDRESS,
        saltBytes32,
        keccak256(creationCode),
      ])
    ).slice(-40)
  );
};

const isProxyDeployed = async (
  implementationName: string,
  network: string
): Promise<boolean> => {
  try {
    const info = await getDeployment(`${implementationName}_Proxy`, network);
    if (info && info.address != undefined) return true;
  } catch {}

  return false;
};

export const isContractDeployed = async (address: string): Promise<boolean> => {
  try {
    const code = await hre.ethers.provider.getCode(address);
    return code !== "0x";
  } catch (error) {
    return false;
  }
};

const createDirectoryIfNotExists = async (directoryPath: string) => {
  if (!existsSync(directoryPath)) {
    await fs.mkdir(directoryPath, { recursive: true });
  }
};
