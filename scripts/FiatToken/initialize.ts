import hre, { ethers } from "hardhat";
import { setTimeout } from "timers/promises";
import { TransactionResponse } from "zksync-web3/build/src/types";
import { getDeployment } from "../../utils/getDeployment";

const initalize = async () => {
  const { network } = hre;

  const [signer] = await ethers.getSigners();
  console.log(`Calling initialize on FiatTokenProxy`);
  console.log(`Signer: ${signer.address}`);

  const fiatTokenProxy = await getDeployment(`FiatTokenProxy`, network.name);
  const fiatTokenV2_2 = await getDeployment(`FiatTokenV2_2`, network.name);

  const fiatTokenContract = await ethers.getContractAt(
    fiatTokenV2_2.abi,
    fiatTokenProxy.address
  );

  /**
   * @notice Initializes the fiat token contract.
   * @param tokenName       The name of the fiat token.
   * @param tokenSymbol     The symbol of the fiat token.
   * @param tokenCurrency   The fiat currency that the token represents.
   * @param tokenDecimals   The number of decimals that the token uses.
   * @param newMasterMinter The masterMinter address for the fiat token.
   * @param newPauser       The pauser address for the fiat token.
   * @param newBlacklister  The blacklister address for the fiat token.
   * @param newOwner        The owner of the fiat token.
   */
  const tokenName = "Bridged USDC (Gelato)"; // Todo: update
  const tokenSymbol = "USDC.e"; // Todo: update
  const tokenCurrency = "USD"; // Todo: update
  const tokenDecimals = 6; // Todo: update
  const newMasterMinter = signer.address; // Todo: update
  const newPauser = signer.address; // Todo: update
  const newBlacklister = signer.address; // Todo: update
  const newOwner = signer.address; // Todo: update

  await setTimeout(10000);

  const response = (await fiatTokenContract.initialize(
    tokenName,
    tokenSymbol,
    tokenCurrency,
    tokenDecimals,
    newMasterMinter,
    newPauser,
    newBlacklister,
    newOwner
  )) as TransactionResponse;

  const receipt = await response.wait();

  if (receipt.status && receipt.status === 1) {
    console.log(
      `Successfully called initialize. Txn: ${receipt.transactionHash}`
    );
  }
};

initalize();
