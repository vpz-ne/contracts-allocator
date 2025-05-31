#configs
strategy_contract_address = "0x5eE13f849CD16eE3180196C1AD61323CC60D6932" # strategy contract
abi_file_path = "aero_abi.json"
admin_address = "0x4a5A093D9f08B8436ced92C0E9BBaa80b78F5688" #checksum adress of admin
token_address = "0x4200000000000000000000000000000000000006"


if __name__ == "__main__":
    import argparse
    from web3 import Web3
    import os
    import json
    import sys
    from pprint import pprint

    parser = argparse.ArgumentParser()
    parser.add_argument('--strategy_contract_address', type=str, default=strategy_contract_address)
    parser.add_argument('--admin_address', type=str, default=admin_address)
    parser.add_argument('--admin_key_path', type=str, default='~/web3/admin.txt')
    parser.add_argument('--token_address', type=str, default=token_address)
    parser.add_argument('--withdraw_amount', type=float, default=0)
    parser.add_argument('--is_address2', action='store_true')
    args = parser.parse_args()

    private_key_path = os.path.expanduser(args.admin_key_path)
    with open(private_key_path, 'r') as file:
        private_key = file.read().strip()


    rpc_url = "https://base-rpc.publicnode.com"  
    web3 = Web3(Web3.HTTPProvider(rpc_url))
    if not web3.is_connected(): 
        raise Exception("failed to connect BASE chain.")

    admin_public_address = web3.eth.account.from_key(private_key).address
    if admin_public_address != args.admin_address:
        print('private vs public not match')
        print(admin_public_address, '!=', args.admin_address)
        sys.exit(-1)
 
    try:
        with open(abi_file_path, "r") as file:
            abi_data = json.load(file)
        abi = abi_data["abi"]
        print("ABI:", abi)
        print('-' * 20)
    except FileNotFoundError:
        print("ABI File Missing")
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")

    proxy_contract = web3.eth.contract(address=args.strategy_contract_address, abi=abi)
    token_abi = [
    {
        "constant": True,
        "inputs": [{"name": "owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function",
    },
    {
        "constant": True,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function",
    },
]

    token_contract = web3.eth.contract(address=args.token_address, abi=token_abi)
    decimals = token_contract.functions.decimals().call()
    print(f'withdraw {args.withdraw_amount} {args.token_address}.')
    user_input = input('continue(y)? ')
    if user_input!='y':
        sys.exit()
    if args.is_address2:
        this_function = proxy_contract.functions.withdrawToAddress2(args.token_address,int(args.withdraw_amount*10**decimals))
    else:
        this_function = proxy_contract.functions.withdrawToAddress1(args.token_address,int(args.withdraw_amount*10**decimals))
    transaction = this_function.build_transaction({
    'from': args.admin_address,
    'nonce': web3.eth.get_transaction_count(args.admin_address),
    'gas': 2000000,
    'gasPrice': int(web3.eth.gas_price*1.2),
    })
    pprint(transaction)
    user_input = input('continue (y)?')
    if user_input == 'y':
        signed_tx = web3.eth.account.sign_transaction(transaction, private_key)
        tx_hash = web3.eth.send_raw_transaction(signed_tx.raw_transaction)
        print(f"txid: {web3.to_hex(tx_hash)}")