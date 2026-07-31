// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @dev Test-only. Forces ether onto a target via `selfdestruct`, bypassing
///      any receive/fallback (or lack thereof) — the classic way a contract's
///      real balance can exceed what it ever received through a payable
///      function it defines. Used by the invariant handler to prove the
///      accounting invariant tolerates stray ether (selfdestruct, or a
///      contract set as `block.coinbase` collecting fees) rather than
///      asserting a strict equality that only holds by accident.
contract EtherForcer {
    constructor() payable {}

    function forceSend(address payable target) external {
        selfdestruct(target);
    }
}
