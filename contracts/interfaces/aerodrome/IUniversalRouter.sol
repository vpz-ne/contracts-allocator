// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IRewardsCollector} from "./IRewardsCollector.sol";

interface IUniversalRouter is IRewardsCollector {
    /// @notice Executes encoded commands along with provided inputs. Reverts if deadline has expired.
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}
