// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Test-only. Attempts to re-enter LegacyVault.withdraw()/claim() from
///      its receive() hook, to prove checks-effects-interactions holds.
interface ILegacyVault {
    function createVault(address _beneficiary, uint256 _checkInInterval, bytes calldata _message) external payable;
    function withdraw(uint256 _amount) external;
    function claim(address _owner) external;
}

contract MaliciousReceiver {
    ILegacyVault public immutable target;

    uint8 private mode; // 0 = idle, 1 = reenter withdraw, 2 = reenter claim
    uint256 private reenterAmount;
    address private claimOwner;
    uint256 public reentryAttempts;

    constructor(address _target) {
        target = ILegacyVault(_target);
    }

    function createVault(address _beneficiary, uint256 _interval, bytes calldata _message) external payable {
        target.createVault{value: msg.value}(_beneficiary, _interval, _message);
    }

    function attackWithdraw(uint256 _amount) external {
        mode = 1;
        reenterAmount = _amount;
        target.withdraw(_amount);
        mode = 0;
    }

    function attackClaim(address _owner) external {
        mode = 2;
        claimOwner = _owner;
        target.claim(_owner);
        mode = 0;
    }

    receive() external payable {
        if (mode == 1) {
            reentryAttempts++;
            target.withdraw(reenterAmount);
        } else if (mode == 2) {
            reentryAttempts++;
            target.claim(claimOwner);
        }
    }
}
