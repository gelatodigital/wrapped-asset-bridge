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
}

interface ProxyOptions {
  type:
    | "EIP173Proxy2StepWithReceive"
    | "EIP173Proxy2Step"
    | "EIP173ProxyWithReceive"
    | "EIP173Proxy";
  ownerAddress: string;
  initData: string;
}

export const create2Deploy = async (
  contractName: string,
  args: any[],
  deployer: SignerWithAddress,
  options?: DeployOptions,
  callOptions?: CallOptions
) => {
  const { salt, proxy } = options ?? {};
  const implementationAddress = await deployContract(
    contractName,
    args,
    deployer,
    salt,
    undefined,
    callOptions
  );

  if (proxy && implementationAddress) {
    const implementationContractName = contractName;
    await deployContract(
      proxy.type,
      [implementationAddress, proxy.ownerAddress, proxy.initData],
      deployer,
      salt,
      implementationContractName,
      callOptions
    );
  }
};

const deployContract = async (
  contractName: string,
  args: any[],
  deployer: SignerWithAddress,
  salt?: string,
  implementationContractName?: string,
  callOptions?: CallOptions
): Promise<string | undefined> => {
  const contractFactory = await hre.ethers.getContractFactory(contractName);
  const creationCode = getCreationCode(contractFactory, args);

  const saltHash = salt
    ? keccak256(toUtf8Bytes(salt))
    : ethers.constants.HashZero;

  const deployedAddress = determineCreate2DeployedAddress(
    creationCode,
    saltHash
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
    saltHash,
    callOptions
  );
  const receipt = await response.wait();

  if (receipt.status === 1) {
    await saveDeploymentInfo(
      contractName,
      args,
      creationCode,
      saltHash,
      receipt,
      implementationContractName
    );
    return deployedAddress;
  }
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

const sendCreate2Transaction = async (
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

const isContractDeployed = async (address: string): Promise<boolean> => {
  try {
    const code = await hre.ethers.provider.getCode(address);
    return code !== "0x";
  } catch (error) {
    return false;
  }
};

const saveDeploymentInfo = async (
  contractName: string,
  args: any[],
  creationCode: string,
  salt: string,
  txReceipt: TransactionReceipt,
  implementationContractName?: string
) => {
  if (txReceipt.status && txReceipt.status !== 0) {
    const deployedAddress = determineCreate2DeployedAddress(creationCode, salt);
    const networkName = hre.network.name;
    const directoryPath = path.join(__dirname, "../deployments", networkName);

    await createDirectoryIfNotExists(directoryPath);
    await saveDeploymentFiles(
      contractName,
      args,
      txReceipt,
      deployedAddress,
      directoryPath,
      salt,
      implementationContractName
    );
  }
};

const saveDeploymentFiles = async (
  contractName: string,
  args: any[],
  txReceipt: TransactionReceipt,
  deployedAddress: string,
  directoryPath: string,
  salt: string,
  implementationContractName?: string
) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;

  const fileName = implementationContractName
    ? `${implementationContractName}_Proxy`
    : contractName;

  const timestampFilePath = path.join(
    directoryPath,
    `${fileName}-${timestamp}.json`
  );
  const latestFilePath = path.join(directoryPath, `${fileName}-latest.json`);
  const chainIdFilePath = path.join(directoryPath, ".chainId");

  const deploymentInfo = {
    address: deployedAddress,
    transactionHash: txReceipt.transactionHash,
    args,
    receipt: txReceipt,
    salt,
    abi: (await hre.artifacts.readArtifact(contractName)).abi,
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

const createDirectoryIfNotExists = async (directoryPath: string) => {
  if (!existsSync(directoryPath)) {
    await fs.mkdir(directoryPath, { recursive: true });
  }
};
