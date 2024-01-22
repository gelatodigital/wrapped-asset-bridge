import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { existsSync, promises as fs } from "fs";
import hre from "hardhat";
import { CallOptions } from "hardhat-deploy/types";
import path from "path";
import { create2FactoryAddress } from "../constants/create2.json";

const { ethers } = hre;
const { utils } = ethers;
const { hexZeroPad, hexlify, keccak256, hexConcat, toUtf8Bytes } = utils;

interface DeployOptions {
  salt?: string;
  proxy?: ProxyOptions;
  creationCode?: string; // Deploy with custom creation code instead of fetching from artifacts.
  abi?: any[]; // Manually inject abi into deployment file when custom creationCode is used.
}

interface ProxyOptions {
  type:
    | "EIP173Proxy2StepWithReceive"
    | "EIP173Proxy2Step"
    | "EIP173ProxyWithReceive"
    | "EIP173Proxy";
  ownerAddress: string;
  initData: string;
  implementationName?: string;
}

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
    options.proxy.implementationName = contractName;

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

  if (options.creationCode) {
    creationCode = options.creationCode;
  } else {
    const contractFactory = await hre.ethers.getContractFactory(contractName);
    creationCode = getCreationCode(contractFactory, args);
  }

  options.salt = options.salt
    ? keccak256(toUtf8Bytes(options.salt))
    : ethers.constants.HashZero;

  const deployedAddress = determineCreate2DeployedAddress(
    creationCode,
    options.salt
  );

  if (await isContractDeployed(deployedAddress)) {
    throw new Error(
      `Contract ${contractName} already deployed at ${deployedAddress}`
    );
  }

  console.log(`Deploying ${contractName} with CREATE2...`);
  const response = await sendCreate2Transaction(
    deployer,
    creationCode,
    options.salt,
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

export const sendCreate2Transaction = async (
  deployer: SignerWithAddress,
  creationCode: string,
  salt: string,
  callOptions?: CallOptions
) => {
  const data = salt + creationCode.slice(2); // slice to remove "0x"
  return deployer.sendTransaction({
    to: create2FactoryAddress,
    data,
    ...callOptions,
  });
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

export const saveDeploymentFiles = async (
  contractName: string,
  args: any[],
  deployedAddress: string,
  txReceipt: TransactionReceipt,
  options: DeployOptions,
  directoryPath: string
) => {
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

  const deploymentInfo = {
    address: deployedAddress,
    transactionHash: txReceipt.transactionHash,
    args,
    receipt: txReceipt,
    salt: options.salt,
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
        create2FactoryAddress,
        saltBytes32,
        keccak256(creationCode),
      ])
    ).slice(-40)
  );
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
