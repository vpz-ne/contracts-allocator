import { HardhatUserConfig } from 'hardhat/config';
import { task } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hardhat-deploy';
import '@nomicfoundation/hardhat-ethers';
import 'hardhat-storage-layout-changes';
import * as dotenv from 'dotenv';

const chainId = Number(process.env.CHAIN_ID);
const rpcUrl = chainId == 8453 ? 'https://mainnet.base.org' : '';

// Load config
const configPath = chainId == 8453 ? '.env.base' : '.env';
dotenv.config({ path: configPath });

// Load account
const privateKeys = [process.env.DEPLOYER_PK, process.env.ADMIN_PK].filter(Boolean) as string[];
const config: HardhatUserConfig = {
    solidity: {
        version: '0.8.28',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhat: {
            forking: {
                url: rpcUrl,
            },
            chainId: Number(chainId),
            accounts: {
                mnemonic: 'test test test test test test test test test test test junk',
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
            },
        },
        bse: {
            url: '',
        },
        base: {
            url: rpcUrl,
            accounts: privateKeys,
            chainId: chainId,
        },
    },
    mocha: {
        timeout: 900000,
    },
    storageLayoutChanges: {
        contracts: ['AerodromeStrategy'],
        fullPath: false,
    },
};

export default config;
