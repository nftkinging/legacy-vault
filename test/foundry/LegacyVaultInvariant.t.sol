// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test} from "forge-std/Test.sol";
import {LegacyVault} from "../../contracts/LegacyVault.sol";
import {Handler} from "./Handler.sol";

contract LegacyVaultInvariantTest is Test {
    LegacyVault internal vaultContract;
    Handler internal handler;

    function setUp() public {
        vaultContract = new LegacyVault();

        address[] memory actors = new address[](5);
        for (uint256 i = 0; i < actors.length; i++) {
            actors[i] = address(uint160(uint256(keccak256(abi.encodePacked("actor", i)))));
        }

        handler = new Handler(vaultContract, actors);
        targetContract(address(handler));
    }

    /// @notice The core accounting invariant: every wei tracked across live
    ///         vaults is backed by the contract's real balance.
    /// @dev Deliberately `<=`, not `==`. Ether can land on a contract without
    ///      going through any payable function it defines — selfdestruct
    ///      (see Handler.forceEther, exercised by the fuzzer itself) or
    ///      being set as block.coinbase and collecting fees are the two
    ///      standard routes. That only ever pushes contract.balance *above*
    ///      the tracked sum, never below, so `<=` still catches the bug that
    ///      actually matters — some vault's tracked balance exceeding what
    ///      the contract actually holds — without false-positiving on
    ///      mainnet the first time stray ether arrives. A strict `==` would
    ///      break permanently and silently mask real regressions the moment
    ///      that happened.
    function invariant_vaultBalancesNeverExceedContractBalance() public view {
        uint256 sum = 0;
        uint256 n = handler.actorsCount();
        for (uint256 i = 0; i < n; i++) {
            address a = handler.actorAt(i);
            try vaultContract.getVault(a) returns (address, uint256 balance, uint256, uint256, bytes memory, bool) {
                sum += balance;
            } catch {}
        }
        assertLe(sum, address(vaultContract).balance);
    }
}
