import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { assert } from 'chai';
import { getAddress } from 'ethers';
import { getDeployer, getAdmin } from '../utils';

import {
    ADMIN,
    TRADER,
    BACKUP_TRADER,
    WITHDRAW_ADDRESS_1,
    WITHDRAW_ADDRESS_2,
    WRAPPED_NATIVE,
    AERO_NONFUNGIBLE_POSITION_MANAGER,
    AERO_UNIVERSAL_ROUTER,
    AERO_POOL_FACTORY,
} from '../config';

import { AerodromeStrategy } from '../../typechain-types';

/// ======== !!! Notice: Must fill proxy address here !!! =============
const PROXY_ADDRESS = '';
/// ==============================

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { ethers } = hre;
    const deployer = await getDeployer();
    const admin = getAdmin();

    // Load proxy
    const proxy = await ethers.getContractAt('UUPSProxy', PROXY_ADDRESS);
    const proxyImpl: AerodromeStrategy = await ethers.getContractAt('AerodromeStrategy', PROXY_ADDRESS);
    const preImplAddr = await proxy.getImpl();

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

    // Upgrade
    const tx = await proxyImpl.connect(admin).upgradeToAndCall(implAddress, new Uint8Array(0));
    await tx.wait();
    const curImplAddr = await proxy.getImpl();
    console.log('***** Upgrade implementation succ *****');
    console.log(`Previous implementation:${preImplAddr}`);
    console.log(`Current implementation:${curImplAddr}`);

    // Verify
    assert.isTrue(preImplAddr != curImplAddr, 'Same impl address');
    assert.isTrue((await proxyImpl.admin()) == getAddress(ADMIN!), 'Admin address mismatch');
    assert.isTrue((await proxyImpl.trader()) == getAddress(TRADER!), 'Trader address mismatch');
    assert.isTrue((await proxyImpl.backupTrader()) == getAddress(BACKUP_TRADER!), 'Backup trader address mismatch');
    assert.isTrue(
        (await proxyImpl.withdrawAddress1()) == getAddress(WITHDRAW_ADDRESS_1!),
        'WITHDRAW_ADDRESS_1 address mismatch'
    );
    assert.isTrue(
        (await proxyImpl.withdrawAddress2()) == getAddress(WITHDRAW_ADDRESS_2!),
        'WITHDRAW_ADDRESS_2 address mismatch'
    );
    assert.isTrue((await proxyImpl.wrappedNative()) == getAddress(WRAPPED_NATIVE!), 'Wrapped native address mismatch');
    assert.isTrue((await proxyImpl.router()) == getAddress(AERO_UNIVERSAL_ROUTER!), 'Router address mismatch');
    assert.isTrue(
        (await proxyImpl.nftPositionManager()) == getAddress(AERO_NONFUNGIBLE_POSITION_MANAGER!),
        'NftPositionManager address mismatch'
    );
    assert.isTrue((await proxyImpl.clFactory()) == getAddress(AERO_POOL_FACTORY!), 'CLFactory address mismatch');
};

export default func;

func.tags = ['UpgradeAerodromeStrategy'];
