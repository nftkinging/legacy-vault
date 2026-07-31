// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Test} from "forge-std/Test.sol";
import {LegacyVault} from "../../contracts/LegacyVault.sol";

/// @dev Fuzz handler for the invariant suite. Bounds every input to
///      something the contract could plausibly receive, and randomly drives
///      a small fixed cast of actors through create/deposit/withdraw/close/
///      checkIn/updateBeneficiary/claim/warp so the invariant test can check
///      the core accounting property holds under arbitrary call sequences.
contract Handler is Test {
    LegacyVault public immutable vault;
    address[] public actors;

    constructor(LegacyVault _vault, address[] memory _actors) {
        vault = _vault;
        actors = _actors;
        for (uint256 i = 0; i < actors.length; i++) {
            vm.deal(actors[i], 1_000 ether);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _hasVault(address a) internal view returns (bool) {
        try vault.getVault(a) returns (address, uint256, uint256, uint256, string memory, bool) {
            return true;
        } catch {
            return false;
        }
    }

    function createVault(uint256 ownerSeed, uint256 benSeed, uint256 amount, uint256 interval) external {
        address owner = _actor(ownerSeed);
        if (_hasVault(owner)) return;
        address beneficiary = _actor(benSeed);
        if (beneficiary == owner) return;
        interval = bound(interval, vault.MIN_INTERVAL(), vault.MAX_INTERVAL());
        amount = bound(amount, vault.MIN_DEPOSIT(), 10 ether);
        vm.prank(owner);
        try vault.createVault{value: amount}(beneficiary, interval, "letter") {} catch {}
    }

    function deposit(uint256 ownerSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        amount = bound(amount, 1, 10 ether);
        vm.prank(owner);
        try vault.deposit{value: amount}() {} catch {}
    }

    function withdraw(uint256 ownerSeed, uint256 amount) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        amount = bound(amount, 1, 20 ether);
        vm.prank(owner);
        try vault.withdraw(amount) {} catch {}
    }

    function closeVault(uint256 ownerSeed) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        vm.prank(owner);
        try vault.closeVault() {} catch {}
    }

    function checkIn(uint256 ownerSeed) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        vm.prank(owner);
        try vault.checkIn() {} catch {}
    }

    function updateBeneficiary(uint256 ownerSeed, uint256 benSeed) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        address newBen = _actor(benSeed);
        if (newBen == owner) return;
        vm.prank(owner);
        try vault.updateBeneficiary(newBen) {} catch {}
    }

    function claim(uint256 ownerSeed) external {
        address owner = _actor(ownerSeed);
        if (!_hasVault(owner)) return;
        (address beneficiary, , , , , ) = vault.getVault(owner);
        vm.prank(beneficiary);
        try vault.claim(owner) {} catch {}
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 0, 400 days);
        vm.warp(block.timestamp + secs);
    }

    function actorsCount() external view returns (uint256) {
        return actors.length;
    }

    function actorAt(uint256 i) external view returns (address) {
        return actors[i];
    }
}
