import hre, { ethers } from "hardhat";
import { setTimeout } from "timers/promises";
import { TransactionResponse } from "zksync-web3/build/src/types";
import { getDeployment } from "../../utils/getDeployment";

const initializeV2_2 = async () => {
  const { network } = hre;

  const [signer] = await ethers.getSigners();
  console.log(`Calling initializeV2_2 on FiatTokenProxy`);
  console.log(`Signer: ${signer.address}`);

  const fiatTokenProxy = await getDeployment(`FiatTokenProxy`, network.name);
  const fiatTokenV2_2 = await getDeployment(`FiatTokenV2_2`, network.name);

  const fiatTokenContract = await ethers.getContractAt(
    fiatTokenV2_2.abi,
    fiatTokenProxy.address
  );

  /**
   * @param accountsToBlacklist   A list of accounts to migrate from the old blacklist
   * @param newSymbol             New token symbol
   */
  const accountsToBlacklist: string[] = []; // Todo: update
  const newSymbol = "USDC.e"; // Todo: update

  await setTimeout(10000);

  const response = (await fiatTokenContract.initializeV2_2(
    accountsToBlacklist,
    newSymbol
  )) as TransactionResponse;

  const receipt = await response.wait();

  if (receipt.status && receipt.status === 1) {
    console.log(
      `Successfully called initializeV2_2. Txn: ${receipt.transactionHash}`
    );
  }
};

initializeV2_2();
