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

    /// @notice The core accounting invariant: every wei the contract holds
    ///         is accounted for by exactly one live vault's balance.
    function invariant_sumOfVaultBalancesEqualsContractBalance() public view {
        uint256 sum = 0;
        uint256 n = handler.actorsCount();
        for (uint256 i = 0; i < n; i++) {
            address a = handler.actorAt(i);
            try vaultContract.getVault(a) returns (address, uint256 balance, uint256, uint256, bytes memory, bool) {
                sum += balance;
            } catch {}
        }
        assertEq(sum, address(vaultContract).balance);
    }
}
