// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

abstract contract StrategyOwner {
    address public immutable admin; // The admin of the contract
    address public immutable trader;
    address public immutable backupTrader;

    bool public allowTrader;

    modifier onlyTrader() {
        address sender = msg.sender;
        require(sender == trader || sender == backupTrader, "Sender is not trader");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Sender is not admin");
        _;
    }

    modifier onlyApprovedSender() {
        address sender = msg.sender;
        require(sender == admin || ((sender == trader || sender == backupTrader) && allowTrader), "Sender not allowed");
        _;
    }

    constructor(address _admin, address _trader, address _backupTrader) {
        admin = _admin;
        trader = _trader;
        backupTrader = _backupTrader;
    }

    function setAllowTrader(bool _allow) external onlyAdmin {
        allowTrader = _allow;
    }
}
