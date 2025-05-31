import { ethers } from 'hardhat';

import { DEPLOYER_PK, ADMIN_PK } from './config';

export async function getDeployer() {
    if (DEPLOYER_PK == undefined || DEPLOYER_PK == '') {
        console.log('DEPLOYER_PK not found... use default account');
        const deployer = (await ethers.getSigners())[0];
        console.log(`deployer:${deployer.address}`);
        return deployer;
    } else {
        return new ethers.Wallet(DEPLOYER_PK, ethers.provider);
    }
}

export function getAdmin() {
    if (ADMIN_PK == undefined || ADMIN_PK == '') {
        console.error('!!! ADMIN_PK not found !!!');
        process.exit(1);
    }

    return new ethers.Wallet(ADMIN_PK, ethers.provider);
}
