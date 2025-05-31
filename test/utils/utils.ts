import { ethers } from 'hardhat';
import { parseEther, toBeHex } from 'ethers';
import { expect } from 'chai';
const hre = require('hardhat');

const ADDR_SIZE = 20;
const FEE_SIZE = 3;
const OFFSET = ADDR_SIZE + FEE_SIZE;
const DATA_SIZE = OFFSET + ADDR_SIZE;

export function encodePath(path: string[], fees: Number[]): string {
    if (path.length != fees.length + 1) {
        throw new Error('path/fee lengths do not match');
    }

    let encoded = '0x';
    for (let i = 0; i < fees.length; i++) {
        // 20 byte encoding of the address
        encoded += path[i].slice(2);
        // 3 byte encoding of the fee
        encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, '0');
    }
    // encode the final token
    encoded += path[path.length - 1].slice(2);

    return encoded.toLowerCase();
}

export async function evmSnapshot() {
    return await hre.network.provider.send('evm_snapshot', []);
}

export async function evmRevert(id = 1) {
    await hre.network.provider.send('evm_revert', [id]);
}

export async function impersonateAndInjectEther(address: string) {
    await hre.network.provider.send('hardhat_impersonateAccount', [address]);

    return await injectEther(address, parseEther('1'));
}

export async function injectEther(address: string, amount: bigint) {
    await hre.network.provider.send('hardhat_setBalance', [address, toBeHex(amount)]);

    return await (ethers as any).getSigner(address);
}

export async function getBalance(address: string) {
    return await ethers.provider.getBalance(address);
}

export function expectEqWithinBps(actual: bigint, expected: bigint, bps: number = 1) {
    const base = BigInt(10000);
    const upper = (expected * (base + BigInt(bps))) / base;
    const lower = (expected * (base - BigInt(bps))) / base;
    expect(actual).to.be.lte(upper);
    expect(actual).to.be.gte(lower);
}
