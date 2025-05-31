import { ethers } from 'hardhat';
import { MaxUint256, parseEther, parseUnits, Signer } from 'ethers';
import { expect } from 'chai';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

import { AerodromeStrategy, IERC20, INonfungiblePositionManager_Aero, UUPSProxy } from '../typechain-types';
import {
    ADMIN_ADDR,
    TRADER_ADDR,
    BACKUP_TRADER_ADDR,
    WETH,
    AERO_NONFUNGIBLE_POSITION_MANAGER,
    AERO_UNIVERSAL_ROUTER,
    AERO_POOL_FACTORY,
    WITHDRAW_ADDRESS_1,
    WITHDRAW_ADDRESS_2,
    USDC,
    WETH_PROVIDER_ADDR,
    USDC_PROVIDER_ADDR,
    CBBTC_PROVIDER_ADDR,
    CBBTC,
    NATIVE,
} from './utils/constants_base';
import {
    encodePath,
    evmSnapshot,
    evmRevert,
    impersonateAndInjectEther,
    expectEqWithinBps,
    injectEther,
    getBalance,
} from './utils/utils';

const chainId = Number(process.env.CHAIN_ID);
if (chainId == 8453) {
    describe('AerodromeStrategy', () => {
        const AERO_CL100_WETH_USDC_POOL_ADDRESS = '0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59';
        const AERO_CL100_USDC_CBBTC_POOL_ADDRESS = '0x4e962BB3889Bf030368F56810A9c96B83CB3E778';

        let trader: Signer;
        let backupTrader: Signer;
        let admin: Signer;
        let uupsProxy: UUPSProxy;
        let uups: AerodromeStrategy;
        let aerodromeImpl1: AerodromeStrategy;
        let aerodromeImpl2: AerodromeStrategy;
        let weth: IERC20;
        let usdc: IERC20;
        let cbBtc: IERC20;
        let wethProvider: Signer;
        let usdcProvider: Signer;
        let cbBtcProvider: Signer;
        let nftPositionMgr: INonfungiblePositionManager_Aero;
        let proxyAddress: string;
        let id: number;

        const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing;
        const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing;

        const setup = async () => {
            // Deploy contracts
            aerodromeImpl1 = await (
                await ethers.getContractFactory('AerodromeStrategy')
            ).deploy(
                ADMIN_ADDR,
                TRADER_ADDR,
                BACKUP_TRADER_ADDR,
                WETH,
                AERO_UNIVERSAL_ROUTER,
                AERO_NONFUNGIBLE_POSITION_MANAGER,
                AERO_POOL_FACTORY,
                WITHDRAW_ADDRESS_1,
                WITHDRAW_ADDRESS_2
            );

            uupsProxy = await (
                await ethers.getContractFactory('UUPSProxy')
            ).deploy(await aerodromeImpl1.getAddress(), aerodromeImpl1.interface.encodeFunctionData('initialize'));
            proxyAddress = await uupsProxy.getAddress();

            uups = await (await ethers.getContractFactory('AerodromeStrategy')).attach(proxyAddress);

            // Verify
            expect(await uupsProxy.getImpl()).to.be.equal(await aerodromeImpl1.getAddress());
            expect(ethers.getAddress(await uups.admin())).to.be.equal(ethers.getAddress(ADMIN_ADDR));
            expect(ethers.getAddress(await uups.trader())).to.be.equal(ethers.getAddress(TRADER_ADDR));
            expect(ethers.getAddress(await uups.backupTrader())).to.be.equal(ethers.getAddress(BACKUP_TRADER_ADDR));
        };

        const setupAccount = async () => {
            trader = await impersonateAndInjectEther(TRADER_ADDR);
            backupTrader = await impersonateAndInjectEther(BACKUP_TRADER_ADDR);
            admin = await impersonateAndInjectEther(ADMIN_ADDR);
            nftPositionMgr = await ethers.getContractAt(
                'INonfungiblePositionManager_Aero',
                AERO_NONFUNGIBLE_POSITION_MANAGER
            );

            weth = await ethers.getContractAt('IERC20', WETH);
            usdc = await ethers.getContractAt('IERC20', USDC);
            cbBtc = await ethers.getContractAt('IERC20', CBBTC);
            wethProvider = await impersonateAndInjectEther(WETH_PROVIDER_ADDR);
            usdcProvider = await impersonateAndInjectEther(USDC_PROVIDER_ADDR);
            cbBtcProvider = await impersonateAndInjectEther(CBBTC_PROVIDER_ADDR);
        };

        before('setup', async () => {
            await setup();
            await setupAccount();
        });

        beforeEach('snapshot', async () => {
            id = await evmSnapshot();
        });

        afterEach(async function () {
            await evmRevert(id);
        });

        it('Upgradeable', async () => {
            aerodromeImpl2 = await (
                await ethers.getContractFactory('AerodromeStrategy')
            ).deploy(
                ADMIN_ADDR,
                TRADER_ADDR,
                BACKUP_TRADER_ADDR,
                WETH,
                AERO_UNIVERSAL_ROUTER,
                AERO_NONFUNGIBLE_POSITION_MANAGER,
                AERO_POOL_FACTORY,
                WITHDRAW_ADDRESS_1,
                WITHDRAW_ADDRESS_2
            );

            // before upgrade
            expect(await uupsProxy.getImpl()).to.be.equal(await aerodromeImpl1.getAddress());

            await uups.connect(admin).upgradeToAndCall(await aerodromeImpl2.getAddress(), new Uint8Array(0));

            // after upgrade
            expect(await uupsProxy.getImpl()).to.be.equal(await aerodromeImpl2.getAddress());
        });

        it('Approve pool', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);

            const pools = await uups.getWhitelistedPools();
            const tokens = await uups.getWhitelistedTokens();

            expect(pools[0]).to.be.equal(AERO_CL100_WETH_USDC_POOL_ADDRESS);
            expect(tokens[0]).to.be.equal(WETH);
            expect(tokens[1]).to.be.equal(USDC);

            expect(tx).to.emit(uups, 'PoolApproved').withArgs(AERO_CL100_WETH_USDC_POOL_ADDRESS);
        });

        it('Approve and revoke pool', async () => {
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], true);

            const pools = await uups.getWhitelistedPools();
            const tokens = await uups.getWhitelistedTokens();

            expect(pools.length).to.be.equal(0);
            expect(tokens.length).to.be.equal(0);
        });

        it('Approve and revoke pool multiple times', async () => {
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], true);
            await uups
                .connect(admin)
                .approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS, AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            const pools = await uups.getWhitelistedPools();
            const tokens = await uups.getWhitelistedTokens();

            expect(pools[0]).to.be.equal(AERO_CL100_WETH_USDC_POOL_ADDRESS);
            expect(pools[1]).to.be.equal(AERO_CL100_USDC_CBBTC_POOL_ADDRESS);
            expect(tokens[0]).to.be.equal(WETH);
            expect(tokens[1]).to.be.equal(USDC);
            expect(tokens[2]).to.be.equal(CBBTC);
        });

        it('create order - isExactIn', async () => {
            const amountIn = parseEther('10');
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await weth.connect(wethProvider).transfer(proxyAddress, amountIn);

            const balanceBefore = await usdc.balanceOf(proxyAddress);
            await uups.connect(trader).createOrder({
                path: encodePath([WETH, USDC], [100]),
                amountIn: amountIn,
                amountOut: 0,
                isExactIn: true,
            });
            const balanceAfter = await usdc.balanceOf(proxyAddress);

            expect(balanceAfter - balanceBefore).to.be.gt(parseUnits('10000', 6)); // assume ETH > 1000 USDC
        });

        it('create order - isExactOut', async () => {
            const amountOut = parseEther('1.5');
            const amountInMax = parseUnits('10000', 6);
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amountInMax);

            const balanceBefore = await weth.balanceOf(proxyAddress);
            await uups.connect(trader).createOrder({
                path: encodePath([WETH, USDC], [100]),
                amountIn: amountInMax,
                amountOut: amountOut,
                isExactIn: false,
            });
            const balanceAfter = await weth.balanceOf(proxyAddress);

            expect(balanceAfter - balanceBefore).to.be.eq(amountOut);
        });

        it('Should revert: create order - path length mismatch', async () => {
            expect(
                uups.connect(trader).createOrder({
                    path: encodePath([WETH, CBBTC, USDC], [100, 100]),
                    amountIn: 0,
                    amountOut: 0,
                    isExactIn: true,
                })
            ).to.be.revertedWith('Path length mismatch');
        });

        it('Should revert: create order - Path not allowed', async () => {
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            expect(
                uups.connect(trader).createOrder({
                    path: encodePath([CBBTC, USDC], [100]),
                    amountIn: 0,
                    amountOut: 0,
                    isExactIn: true,
                })
            ).to.be.revertedWith('Path not allowed');
        });

        it('create pool order - isExactIn', async () => {
            const amountIn = parseEther('10');
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await weth.connect(wethProvider).transfer(proxyAddress, amountIn);

            const wethBalanceBefore = await weth.balanceOf(proxyAddress);
            const balanceBefore = await usdc.balanceOf(proxyAddress);
            await uups.connect(trader).createPoolOrder({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                amountIn: amountIn,
                amountOut: 0,
                isExactIn: true,
                reverse: false,
            });
            const balanceAfter = await usdc.balanceOf(proxyAddress);
            const wethBalanceAfter = await weth.balanceOf(proxyAddress);

            expect(balanceAfter - balanceBefore).to.be.gt(parseUnits('10000', 6)); // assume ETH > 1000 USDC
            expect(wethBalanceBefore - wethBalanceAfter).to.be.eq(amountIn);
        });

        it('create pool order - isExactOut', async () => {
            const amountOut = parseEther('1.5');
            const amountInMax = parseUnits('10000', 6);
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amountInMax);

            const balanceBefore = await weth.balanceOf(proxyAddress);
            await uups.connect(trader).createPoolOrder({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                amountIn: amountInMax,
                amountOut: amountOut,
                isExactIn: false,
                reverse: false,
            });
            const balanceAfter = await weth.balanceOf(proxyAddress);

            expect(balanceAfter - balanceBefore).to.be.eq(amountOut);
        });

        it('Should revert: create pool order - not whitelisted pool', async () => {
            const amountIn = parseEther('10');
            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await weth.connect(wethProvider).transfer(proxyAddress, amountIn);

            expect(
                uups.connect(trader).createPoolOrder({
                    pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                    amountIn: amountIn,
                    amountOut: 0,
                    isExactIn: true,
                    reverse: false,
                })
            ).to.be.revertedWith('Not whitelisted pool');
        });

        it('withdrawToAddress1 - admin', async () => {
            const amount = parseUnits('1000', 6);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amount);
            await uups.connect(admin).setAllowTrader(true);

            const balanceBefore = await usdc.balanceOf(WITHDRAW_ADDRESS_1);
            await uups.connect(admin).withdrawToAddress1(USDC, amount);
            const balanceAfter = await usdc.balanceOf(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress1 - admin: Native token', async () => {
            const amount = parseEther('10');
            await injectEther(proxyAddress, amount);

            const balanceBefore = await getBalance(WITHDRAW_ADDRESS_1);
            await uups.connect(admin).withdrawToAddress1(NATIVE, amount);
            const balanceAfter = await getBalance(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress1 - admin: WETH', async () => {
            const amount = parseEther('10');
            await weth.connect(wethProvider).transfer(proxyAddress, amount);

            const balanceBefore = await getBalance(WITHDRAW_ADDRESS_1);
            await uups.connect(admin).withdrawToAddress1(WETH, amount);
            const balanceAfter = await getBalance(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress1 - admin: allowTrader is false', async () => {
            const amount = parseUnits('1000', 6);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amount);
            await uups.connect(admin).setAllowTrader(false);

            const balanceBefore = await usdc.balanceOf(WITHDRAW_ADDRESS_1);
            await uups.connect(admin).withdrawToAddress1(USDC, amount);
            const balanceAfter = await usdc.balanceOf(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress1 - trader', async () => {
            const amount = parseUnits('1000', 6);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amount);
            await uups.connect(admin).setAllowTrader(true);

            const balanceBefore = await usdc.balanceOf(WITHDRAW_ADDRESS_1);
            await uups.connect(trader).withdrawToAddress1(USDC, amount);
            const balanceAfter = await usdc.balanceOf(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress1 - backup trader', async () => {
            const amount = parseUnits('1000', 6);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amount);
            await uups.connect(admin).setAllowTrader(true);

            const balanceBefore = await usdc.balanceOf(WITHDRAW_ADDRESS_1);
            await uups.connect(backupTrader).withdrawToAddress1(USDC, amount);
            const balanceAfter = await usdc.balanceOf(WITHDRAW_ADDRESS_1);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('withdrawToAddress2 - trader', async () => {
            const amount = parseUnits('1000', 6);
            await usdc.connect(usdcProvider).transfer(proxyAddress, amount);
            await uups.connect(admin).setAllowTrader(true);

            const balanceBefore = await usdc.balanceOf(WITHDRAW_ADDRESS_2);
            await uups.connect(trader).withdrawToAddress2(USDC, amount);
            const balanceAfter = await usdc.balanceOf(WITHDRAW_ADDRESS_2);

            expect(balanceAfter - balanceBefore).to.be.eq(amount);
        });

        it('Should revert: withdrawToAddress1 - Sender not allowed(trader)', async () => {
            expect(uups.connect(trader).withdrawToAddress1(USDC, 1000)).to.be.revertedWith('Sender not allowed');
        });

        it('Should revert: withdrawToAddress1 - Sender not allowed(backup trader)', async () => {
            expect(uups.connect(backupTrader).withdrawToAddress1(USDC, 1000)).to.be.revertedWith('Sender not allowed');
        });

        it('Should revert: withdrawToAddress2 - Sender not allowed(trader)', async () => {
            expect(uups.connect(trader).withdrawToAddress2(USDC, 1000)).to.be.revertedWith('Sender not allowed');
        });

        it('Add liquidity', async () => {
            const usdcAmount = parseUnits('10000', 6);
            const wethAmount = parseEther('100');

            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await weth.connect(wethProvider).transfer(proxyAddress, wethAmount);

            const pool = await ethers.getContractAt('ICLPool', AERO_CL100_WETH_USDC_POOL_ADDRESS);
            const tickSpacing: number = Number(await pool.tickSpacing());

            const minTick = getMinTick(tickSpacing);
            const maxTick = getMaxTick(tickSpacing);

            // add liquidity
            const [, , amount0, amount1] = await uups.connect(trader).addLiquidity.staticCall({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: wethAmount / BigInt(2),
                amount1Desired: usdcAmount / BigInt(2),
                amount0Min: 0,
                amount1Min: 0,
            });

            await uups.connect(trader).addLiquidity({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: wethAmount / BigInt(2),
                amount1Desired: usdcAmount / BigInt(2),
                amount0Min: 0,
                amount1Min: 0,
            });

            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);
            const wethBalanceAfter = await weth.balanceOf(proxyAddress);

            expect(wethBalanceAfter).to.be.equal(wethAmount - amount0);
            expect(usdcBalanceAfter).to.be.equal(usdcAmount - amount1);
        });

        it('Remove liquidity', async () => {
            const usdcAmount = parseUnits('10000', 6);
            const wethAmount = parseEther('100');

            await uups.connect(admin).approvePools([AERO_CL100_WETH_USDC_POOL_ADDRESS], false);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await weth.connect(wethProvider).transfer(proxyAddress, wethAmount);

            const pool = await ethers.getContractAt('ICLPool', AERO_CL100_WETH_USDC_POOL_ADDRESS);
            const tickSpacing: number = Number(await pool.tickSpacing());

            const minTick = getMinTick(tickSpacing);
            const maxTick = getMaxTick(tickSpacing);

            // add liquidity
            const [tokenId, liquidity, amount0, amount1] = await uups.connect(trader).addLiquidity.staticCall({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: wethAmount / BigInt(2),
                amount1Desired: usdcAmount / BigInt(2),
                amount0Min: 0,
                amount1Min: 0,
            });

            await uups.connect(trader).addLiquidity({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                tickLower: minTick,
                tickUpper: maxTick,
                amount0Desired: wethAmount / BigInt(2),
                amount1Desired: usdcAmount / BigInt(2),
                amount0Min: 0,
                amount1Min: 0,
            });

            const usdcBalanceBefore = await usdc.balanceOf(proxyAddress);
            const wethBalanceBefore = await weth.balanceOf(proxyAddress);

            // remove liquidity
            await uups.connect(trader).removeLiquidity({
                pool: AERO_CL100_WETH_USDC_POOL_ADDRESS,
                tokenId,
                liquidity,
                amount0Min: 0,
                amount1Min: 0,
            });

            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);
            const wethBalanceAfter = await weth.balanceOf(proxyAddress);

            expect(nftPositionMgr.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
            expectEqWithinBps(wethBalanceAfter - wethBalanceBefore, amount0);
            expectEqWithinBps(usdcBalanceAfter - usdcBalanceBefore, amount1);
        });

        it('Create exposure order: token0 principal - exposure > limitRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('12000', 6);
            const cbBtcAmount = parseUnits('1', 8);
            const principalAmount = parseUnits('10000', 6);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: USDC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(usdcBalanceAfter).to.be.eq(usdcAmount - (principalAmount * limitRatioX1000) / BigInt(1000));
            expect(balanceAfter).to.be.gt(cbBtcAmount);
        });

        it('Create exposure order: token0 principal - thresholdRatioX1000 < exposure < limitRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('10500', 6);
            const cbBtcAmount = parseUnits('1', 8);
            const principalAmount = parseUnits('10000', 6);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: USDC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(usdcBalanceAfter).to.be.eq(principalAmount);
            expect(balanceAfter).to.be.gt(cbBtcAmount);
        });

        it('Create exposure order: token0 principal - exposure < thresholdRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('10005', 6);
            const cbBtcAmount = parseUnits('1', 8);
            const principalAmount = parseUnits('10000', 6);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: USDC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(usdcBalanceAfter).to.be.eq(usdcAmount);
            expect(balanceAfter).to.be.eq(cbBtcAmount);
        });

        it('Create exposure order: token1 principal - exposure > thresholdRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('10000', 6);
            const cbBtcAmount = parseUnits('1.2', 8);
            const principalAmount = parseUnits('1', 8);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: CBBTC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(balanceAfter).to.be.eq(cbBtcAmount - (principalAmount * limitRatioX1000) / BigInt(1000));
            expect(usdcBalanceAfter).to.be.gt(usdcAmount);
        });

        it('Create exposure order: token1 principal - thresholdRatioX1000 < exposure < thresholdRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('10000', 6);
            const cbBtcAmount = parseUnits('1.05', 8);
            const principalAmount = parseUnits('1', 8);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: CBBTC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(balanceAfter).to.be.eq(principalAmount);
            expect(usdcBalanceAfter).to.be.gt(usdcAmount);
        });

        it('Create exposure order: token1 principal - exposure < thresholdRatioX1000', async () => {
            const tx = await uups.connect(admin).approvePools([AERO_CL100_USDC_CBBTC_POOL_ADDRESS], false);

            // transfer USDC + cbBTC
            const usdcAmount = parseUnits('10000', 6);
            const cbBtcAmount = parseUnits('1.005', 8);
            const principalAmount = parseUnits('1', 8);
            const thresholdRatioX1000 = BigInt(10);
            const limitRatioX1000 = BigInt(100);
            await usdc.connect(usdcProvider).transfer(proxyAddress, usdcAmount);
            await cbBtc.connect(cbBtcProvider).transfer(proxyAddress, cbBtcAmount);

            await uups.connect(backupTrader).createExposureOrder({
                pool: AERO_CL100_USDC_CBBTC_POOL_ADDRESS,
                principalToken: CBBTC,
                principalAmount: principalAmount,
                thresholdRatioX1000,
                limitRatioX1000,
            });
            const balanceAfter = await cbBtc.balanceOf(proxyAddress);
            const usdcBalanceAfter = await usdc.balanceOf(proxyAddress);

            expect(balanceAfter).to.be.eq(cbBtcAmount);
            expect(usdcBalanceAfter).to.be.eq(usdcAmount);
        });
    });
}
