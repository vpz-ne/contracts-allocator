#configs
strategy_contract_address = "0x5eE13f849CD16eE3180196C1AD61323CC60D6932" # strategy contract
abi_file_path = "scripts/aero_abi.json"

if __name__ == "__main__":
    import argparse
    from web3 import Web3
    import json
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument('--strategy_contract_address', type=str, default=strategy_contract_address)
    parser.add_argument('--m', type=str)
    args = parser.parse_args()


    rpc_url = "https://base-rpc.publicnode.com"  
    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected(): 
        raise Exception("failed to connect BASE chain.")

    try:
        with open(abi_file_path, "r") as file:
            abi_data = json.load(file)
        abi = abi_data["abi"]
    except FileNotFoundError:
        print("ABI File Missing")
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")

    proxy_contract = web3.eth.contract(address=args.strategy_contract_address, abi=abi)

    if args.m is None:
        print("Query method required.")
        sys.exit(-1)
    elif args.m == "get_daily_gas_amount":
        result = proxy_contract.functions.dailyGasAmount().call()
        print("Daily gas limit for strategy wallet is", result/1e18, "ETH")
    elif args.m == "get_whitelisted_pools":
        result = proxy_contract.functions.getWhitelistedPools().call()
        print("Whitelisted pools:", result)
    elif args.m == "get_whitelisted_tokens":
        result = proxy_contract.functions.getWhitelistedTokens().call()
        print("Whitelisted tokens:", result)
    elif args.m == "get_callers_address":
        result1 = proxy_contract.functions.admin().call()
        result2 = proxy_contract.functions.trader().call()
        result3 = proxy_contract.functions.backupTrader().call()
        print("admin wallet:", result1)
        print("trader wallet:", result2)
        print("backup_trader wallet:",result3)
    elif args.m == "get_withdraw_address":
        result1 = proxy_contract.functions.withdrawAddress1().call()
        result2 = proxy_contract.functions.withdrawAddress2().call()
        print("withdraw addresses:", result1,result2)
    elif args.m == "get_allow_trader_withdraw":
        result1 = proxy_contract.functions.allowTrader().call()
        print("allow trader withdraw to approved addresses:", result1)
    else:
        print("method not found.")

