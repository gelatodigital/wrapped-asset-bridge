import { HardhatUserConfig } from "hardhat/config";

import * as dotenv from "dotenv";
dotenv.config();

import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "./tasks/index";
// import "hardhat-contract-sizer";
// import "hardhat-gas-reporter";
// import "solidity-coverage";

// Libraries
import assert from "assert";

// @dev Put this in .env
const ALCHEMY_ID = process.env.ALCHEMY_ID;
assert.ok(ALCHEMY_ID, "no Alchemy ID in process.env");
const INFURA_ID = process.env.INFURA_ID;
assert.ok(INFURA_ID, "no Infura ID in process.env");
const DEPLOYER_PK = process.env.DEPLOYER_PK as string;
assert.ok(INFURA_ID, "no Deployer PK in process.env");

const DEV_PK = process.env.DEV_PK as string;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY as string;

const accounts: string[] = DEV_PK ? [DEPLOYER_PK, DEV_PK] : [DEPLOYER_PK];

const config: HardhatUserConfig = {
  namedAccounts: {
    deployer: 0,
    dev: 1,
  },

  networks: {
    hardhat: {},

    // Local
    zksyncLocal: {
      url: "http://localhost:3050",
      zksync: true,
      accounts: [
        "0x7726827caac94a7f9e1b160f7ea819f172f7b6f9d2a97f992c38edeab82d4110", //0x36615Cf349d7F6344891B1e7CA7C72883F5dc049
        "0xac1e735be8536c6534bb4f17f06f6afc73b2b5ba84ac2cfb12f7461b20c0bbe3", //0xa61464658AfeAf65CccaaFD3a512b69A83B77618
      ],
    },

    // Prod
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 42161,
      accounts,
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts,
    },
    base: {
      url: `https://mainnet.base.org`,
      chainId: 8453,
      accounts,
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts,
    },
    fantom: {
      accounts,
      chainId: 250,
      url: `https://rpcapi.fantom.network/`,
    },
    gnosis: {
      accounts,
      chainId: 100,
      url: `https://gnosis-mainnet.public.blastapi.io`,
    },
    linea: {
      url: `https://linea-mainnet.infura.io/v3/${INFURA_ID}`,
      chainId: 59144,
      accounts,
    },
    ethereum: {
      accounts,
      chainId: 1,
      url: `https://eth-mainnet.alchemyapi.io/v2/${ALCHEMY_ID}`,
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 10,
      accounts,
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 137,
      accounts,
    },
    polygonzk: {
      url: "https://zkevm-rpc.com",
      chainId: 1101,
      accounts,
    },
    zksync: {
      zksync: true,
      url: "https://mainnet.era.zksync.io",
      chainId: 324,
      accounts,
      verifyURL:
        "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },

    // Staging
    arbgoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      chainId: 421613,
      accounts,
    },
    arbsepolia: {
      url: `https://sepolia-rollup.arbitrum.io/rpc`,
      chainId: 421614,
      accounts,
    },
    basesepolia: {
      url: `https://sepolia.base.org`,
      chainId: 84532,
      accounts,
    },
    baseGoerli: {
      url: "https://goerli.base.org",
      chainId: 84531,
      accounts,
    },
    gelopcelestiatestnet: {
      url: `https://rpc.op-celestia-testnet.gelato.digital`,
      chainId: 123420111,
      accounts,
    },
    geloptestnet: {
      url: `https://rpc.op-testnet.gelato.digital`,
      chainId: 42069,
      accounts,
    },
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_ID}`,
      chainId: 5,
      accounts,
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 80001,
      accounts,
    },
    ogoerli: {
      url: `https://opt-goerli.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 420,
      accounts,
    },
    osepolia: {
      url: `https://sepolia.optimism.io`,
      chainId: 11155420,
      accounts,
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_ID}`,
      chainId: 11155111,
      accounts,
    },
    unreal: {
      url: `https://rpc.unreal.gelato.digital`,
      chainId: 18231,
      accounts,
    },
    zkatana: {
      url: "https://rpc.zkatana.gelato.digital",
      chainId: 1261120,
      accounts,
    },
  },

  solidity: {
    compilers: [
      {
        version: "0.8.21",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },

  // contractSizer: {
  //   alphaSort: false,
  //   runOnCompile: true,
  //   disambiguatePaths: false,
  // },

  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },

  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "osepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/",
        },
      },
    ],
  },
};

export default config;
