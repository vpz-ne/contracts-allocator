This is automated generated repo. As a user, do not commit/push anything

## Custodial Trading Interface for Aerodrome

### NodeJs

NodeJS version v18.19.0

Go to https://nodejs.org/en/download/package-manager find the install script

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 18.19.0
nvm use 18.19.0
node -v
```

run follow to install dependencies

```bash
npm install
```

### Run tests

```
CHAIN_ID={chain id} npx hardhat test
```
ex: CHAIN_ID=8453 npx hardhat test

or run specific test file with
```
CHAIN_ID={chain id} npx hardhat test {test file}
```
ex: CHAIN_ID=8453 npx hardhat test ./test/AerodromeStrategy.test.ts

### Deploy

#### STEP1

Rename file `.env.sample` to `.env.{network}`

#### STEP2

Make sure fill the following environment variables in the .env.{network}
ex: `.env.base`

#### STEP3

Run deploying script:

```
CHAIN_ID={chain id} npx hardhat deploy --network {network} --tags {tags}
```

ex: for Base mainnet deploying AerodromeStrategy.sol, use below command:

```
CHAIN_ID=8453 npx hardhat deploy --network base --tags AerodromeStrategy
```

### Upgrade implementation

#### STEP1

Make sure fill all the environment variables in the .env.{network}
ex: `.env.base`

#### STEP2

Assign proxy address parameter `PROXY_ADDRESS` in the upgrade script.

#### STEP3

Run upgrading script:

```
CHAIN_ID={chain id} npx hardhat deploy --network {network} --tags {tags}
```

ex: for Base mainnet upgrading AerodromeStrategy.sol, use below command:

```
CHAIN_ID=8453 npx hardhat deploy --network base --tags UpgradeAerodromeStrategy
```

Sometimes hardhat might not deploy new instance, hardhat cache previous deployment result and won't deploy a new one if the contract byte code doesn't change. Add --reset flag to the command if you want a force deployment.

```
CHAIN_ID=8453 npx hardhat deploy --network base --reset --tags UpgradeAerodromeStrategy
```

### Admin scripts

#### Set daily gas limit

Run script:

```
python scripts/set_daily_gas_limit.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --daily_gas {daily_gas}
```

ex: to set up 0.1 ETH as the daily gas withdraw limit for a strategy contract address:

```
python scripts/set_daily_gas_limit.py --strategy_contract_address 0x5eE13f849CD16eE3180196C1AD61323CC60D6932 --admin_address 0x4a5A093D9f08B8436ced92C0E9BBaa80b78F5688 --admin_key_path ~/web3/admin.txt --daily_gas 0.1
```

#### Approve pool and revoke

to approve, run script:

```
python scripts/approve_pool.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --pool_address {pool_address}
```

to revoke, run script:

```
python scripts/approve_pool.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --pool_address {pool_address} --revoke
```

#### Allow TRADER withdraw to approved address

to approve, run script:

```
python scripts/allow_trader_withdraw.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path}
```

to revoke, run script:

```
python scripts/allow_trader_withdraw.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --revoke
```

#### Withdraw tokens

to withdraw token to WITHDRAW_ADDRESS_1, run script:

```
python scripts/withdraw_token.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --token_address {token_address} --withdraw_amount {withdraw_amount}
```

to withdraw token to WITHDRAW_ADDRESS_2, run script:

```
python scripts/withdraw_token.py --strategy_contract_address {strategy_contract_address} --admin_address {admin_address} --admin_key_path {admin_key_path} --token_address {token_address} --withdraw_amount {withdraw_amount} --is_address2
```

ex: to withdraw 100 WETH to WITHDRAW_ADDRESS_2:

```
python scripts/withdraw_token.py --strategy_contract_address 0x5eE13f849CD16eE3180196C1AD61323CC60D6932 --admin_address 0x4a5A093D9f08B8436ced92C0E9BBaa80b78F5688 --token_address 0x4200000000000000000000000000000000000006 --withdraw_amount 100 --is_address2 
```

#### Check daily gas limit

```
python scripts/get_infos.py --strategy_contract_address {strategy_contract_address} --m get_daily_gas_amount
```

#### Check whitelisted tokens

```
python scripts/get_infos.py --strategy_contract_address {strategy_contract_address} --m get_whitelisted_pools
```

#### Check callers' addresses

```
python scripts/get_infos.py --strategy_contract_address {strategy_contract_address} --m get_callers_address
```

#### Check withdraw addresses

```
python scripts/get_infos.py --strategy_contract_address {strategy_contract_address} --m get_withdraw_address
```

### FAQs

#### Q: What is the process for deposits and withdrawals?

A: The contract imposes no deposit restrictions. After deployment and testing, the contract address can directly receive funds. For withdrawals, transactions are sent by the ADMIN, and funds can only be withdrawn to the two WITHDRAW_ADDRESSes configured during deployment. Unless the contract is upgraded, no role can withdraw funds to other addresses. In addition, the ADMIN can grant authorization to the TRADER, to allow TRADER to call the withdrawal method. This is typically used in cases where the principal is 100% USDC and the trader needs to manage lending positions.
