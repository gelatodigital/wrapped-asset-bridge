import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";

export const deployLzV2Endpoint = async (
  owner: SignerWithAddress,
  localEid: number,
  remoteEids: number[]
) => {
  return _deployLzV2Endpoint(owner, localEid, remoteEids, false);
};

export const deployLzV2EndpointMock = async (
  owner: SignerWithAddress,
  localEid: number,
  remoteEids: number[]
) => {
  return _deployLzV2Endpoint(owner, localEid, remoteEids, true);
};

export const _deployLzV2Endpoint = async (
  owner: SignerWithAddress,
  localEid: number,
  remoteEids: number[],
  isMock: boolean
) => {
  const endpointContract = isMock ? "EndpointV2Mock" : "EndpointV2Harness";
  const endpointFactory = await ethers.getContractFactory(endpointContract);
  const endpoint = await endpointFactory.deploy(localEid, owner.address);
  const treasuryFactory = await ethers.getContractFactory("TreasuryMock");
  const treasury = await treasuryFactory.deploy();
  const msgLibFactory = await ethers.getContractFactory("SimpleMessageLib");
  const msgLib = await msgLibFactory.deploy(endpoint.address, treasury.address);

  await endpoint.registerLibrary(msgLib.address);

  for (const remoteEid of remoteEids) {
    await endpoint.setDefaultSendLibrary(remoteEid, msgLib.address);
    await endpoint.setDefaultReceiveLibrary(remoteEid, msgLib.address, 0);
  }

  return endpoint;
};
