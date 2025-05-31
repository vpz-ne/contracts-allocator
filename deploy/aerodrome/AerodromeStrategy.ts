import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { assert } from 'chai';
import { getAddress } from 'ethers';
import { getDeployer } from '../utils';

import {
    ADMIN,
    BACKUP_TRADER,
    TRADER,
    WITHDRAW_ADDRESS_1,
    WITHDRAW_ADDRESS_2,
    WRAPPED_NATIVE,
    AERO_NONFUNGIBLE_POSITION_MANAGER,
    AERO_UNIVERSAL_ROUTER,
    AERO_POOL_FACTORY,
} from '../config';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { ethers } = hre;
    const deployer = await getDeployer();

    // Deploy AerodromeStrategy impl
    const impl = await (
        await ethers.getContractFactory('AerodromeStrategy', deployer)
    ).deploy(
        ADMIN,
        TRADER,
        BACKUP_TRADER,
        WRAPPED_NATIVE,
        AERO_UNIVERSAL_ROUTER,
        AERO_NONFUNGIBLE_POSITION_MANAGER,
        AERO_POOL_FACTORY,
        WITHDRAW_ADDRESS_1,
        WITHDRAW_ADDRESS_2
    );
    await impl.waitForDeployment();
    const implAddress = await impl.getAddress();
    console.log(`AerodromeStrategy deployed at: ${implAddress}`);

    // Deploy proxy
    const implContract = await ethers.getContractAt('AerodromeStrategy', implAddress);
    const proxy = await (
        await ethers.getContractFactory('UUPSProxy', deployer)
    ).deploy(implAddress, implContract.interface.encodeFunctionData('initialize'));
    await proxy.waitForDeployment();
    const proxyAddress = await proxy.getAddress();
    console.log(`Proxy deployed at: ${proxyAddress}`);

    // Verify
    const uups = await ethers.getContractAt('UUPSProxy', proxyAddress);
    const uupsImpl = await ethers.getContractAt('AerodromeStrategy', proxyAddress);

    assert.isTrue(implAddress == (await uups.getImpl()), 'Impl address mismatch');
    assert.isTrue((await uupsImpl.admin()) == getAddress(ADMIN!), 'Admin address mismatch');
    assert.isTrue((await uupsImpl.trader()) == getAddress(TRADER!), 'Trader address mismatch');
    assert.isTrue((await uupsImpl.backupTrader()) == getAddress(BACKUP_TRADER!), 'Backup trader address mismatch');
    assert.isTrue(
        (await uupsImpl.withdrawAddress1()) == getAddress(WITHDRAW_ADDRESS_1!),
        'WITHDRAW_ADDRESS_1 address mismatch'
    );
    assert.isTrue(
        (await uupsImpl.withdrawAddress2()) == getAddress(WITHDRAW_ADDRESS_2!),
        'WITHDRAW_ADDRESS_2 address mismatch'
    );
    assert.isTrue((await uupsImpl.wrappedNative()) == getAddress(WRAPPED_NATIVE!), 'Wrapped native address mismatch');
    assert.isTrue((await uupsImpl.router()) == getAddress(AERO_UNIVERSAL_ROUTER!), 'Router address mismatch');
    assert.isTrue(
        (await uupsImpl.nftPositionManager()) == getAddress(AERO_NONFUNGIBLE_POSITION_MANAGER!),
        'NftPositionManager address mismatch'
    );
    assert.isTrue((await uupsImpl.clFactory()) == getAddress(AERO_POOL_FACTORY!), 'CLFactory address mismatch');
};

export default func;

func.tags = ['AerodromeStrategy'];
