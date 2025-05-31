import 'dotenv/config';

export const ADMIN = process.env.ADMIN;
export const TRADER = process.env.TRADER;
export const BACKUP_TRADER = process.env.BACKUP_TRADER;
export const ADMIN_PK = process.env.ADMIN_PK;
export const DEPLOYER_PK = process.env.DEPLOYER_PK;
export const CEX_DEPOSIT_ADDRESS = process.env.CEX_DEPOSIT_ADDRESS;
export const WITHDRAW_ADDRESS_1 = process.env.WITHDRAW_ADDRESS_1;
export const WITHDRAW_ADDRESS_2 = process.env.WITHDRAW_ADDRESS_2;

// On-chain
export const WRAPPED_NATIVE = process.env.WRAPPED_NATIVE;
export const PANCAKESWAP_SMART_ROUTER = process.env.PANCAKESWAP_SMART_ROUTER;
export const PANCAKESWAP_NONFUNGIBLE_POSITION_MANAGER = process.env.PANCAKESWAP_NONFUNGIBLE_POSITION_MANAGER;
export const PANCAKESWAP_MASTER_CHEF = process.env.PANCAKESWAP_MASTER_CHEF;

/// Aerodrome
export const AERO_UNIVERSAL_ROUTER = process.env.AERO_UNIVERSAL_ROUTER;
export const AERO_NONFUNGIBLE_POSITION_MANAGER = process.env.AERO_NONFUNGIBLE_POSITION_MANAGER;
export const AERO_POOL_FACTORY = process.env.AERO_POOL_FACTORY;
