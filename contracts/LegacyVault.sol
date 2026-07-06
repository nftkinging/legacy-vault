// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Legacy Vault — a dead man's switch on BOT Chain
/// @notice Lock funds and a final message for a beneficiary. As long as you
///         keep checking in, nothing happens. If you go silent past your
///         chosen interval, the beneficiary can claim what you left behind.
/// @dev    One vault per owner address. Balance is zeroed before transfer to
///         prevent reentrancy. The message is stored in plaintext on-chain —
///         a production version would store an encrypted payload.
contract LegacyVault {
    struct Vault {
        address beneficiary;    // who can claim if the owner goes silent
        uint256 balance;        // BOT locked in the vault (wei)
        uint256 checkInInterval;// seconds of silence before claim unlocks
        uint256 lastCheckIn;    // timestamp of the owner's last proof of life
        string message;         // the letter left behind
        bool exists;
    }

    mapping(address => Vault) private vaults;
    // reverse lookup: beneficiary => list of vault owners who named them
    mapping(address => address[]) private ownersForBeneficiary;

    event VaultCreated(address indexed owner, address indexed beneficiary, uint256 amount, uint256 checkInInterval);
    event CheckedIn(address indexed owner, uint256 timestamp);
    event Deposited(address indexed owner, uint256 amount, uint256 newBalance);
    event MessageUpdated(address indexed owner);
    event Withdrawn(address indexed owner, uint256 amount, uint256 newBalance);
    event Claimed(address indexed owner, address indexed beneficiary, uint256 amount);

    modifier onlyVaultOwner() {
        require(vaults[msg.sender].exists, "No vault for this address");
        _;
    }

    /// @notice Create your vault. Send BOT along with the call to lock it.
    /// @param _beneficiary Who may claim if you go silent.
    /// @param _checkInInterval Seconds of silence before the claim unlocks (min 60).
    /// @param _message The letter revealed to your beneficiary.
    function createVault(address _beneficiary, uint256 _checkInInterval, string calldata _message) external payable {
        require(!vaults[msg.sender].exists, "Vault already exists");
        require(_beneficiary != address(0), "Beneficiary required");
        require(_beneficiary != msg.sender, "Beneficiary must be someone else");
        require(_checkInInterval >= 60, "Interval must be at least 60s");
        require(msg.value > 0, "Lock at least some BOT");

        vaults[msg.sender] = Vault({
            beneficiary: _beneficiary,
            balance: msg.value,
            checkInInterval: _checkInInterval,
            lastCheckIn: block.timestamp,
            message: _message,
            exists: true
        });
        ownersForBeneficiary[_beneficiary].push(msg.sender);

        emit VaultCreated(msg.sender, _beneficiary, msg.value, _checkInInterval);
    }

    /// @notice Proof of life. Resets the silence timer.
    function checkIn() external onlyVaultOwner {
        vaults[msg.sender].lastCheckIn = block.timestamp;
        emit CheckedIn(msg.sender, block.timestamp);
    }

    /// @notice Add more BOT to your vault. Also counts as a check-in.
    function deposit() external payable onlyVaultOwner {
        require(msg.value > 0, "Nothing sent");
        Vault storage v = vaults[msg.sender];
        v.balance += msg.value;
        v.lastCheckIn = block.timestamp;
        emit Deposited(msg.sender, msg.value, v.balance);
    }

    /// @notice Rewrite the letter. Also counts as a check-in.
    function updateMessage(string calldata _message) external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        v.message = _message;
        v.lastCheckIn = block.timestamp;
        emit MessageUpdated(msg.sender);
    }

    /// @notice Take funds back out. It's your money — allowed any time.
    function withdraw(uint256 _amount) external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        require(_amount > 0 && _amount <= v.balance, "Invalid amount");
        v.balance -= _amount;
        v.lastCheckIn = block.timestamp;
        (bool ok, ) = msg.sender.call{value: _amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, _amount, v.balance);
    }

    /// @notice Beneficiary claims the vault of an owner who has gone silent.
    /// @param _owner The vault owner's address.
    function claim(address _owner) external {
        Vault storage v = vaults[_owner];
        require(v.exists, "No such vault");
        require(msg.sender == v.beneficiary, "Not the beneficiary");
        require(block.timestamp > v.lastCheckIn + v.checkInInterval, "Owner is still checking in");
        uint256 amount = v.balance;
        require(amount > 0, "Nothing to claim");

        v.balance = 0; // zero before transfer (reentrancy guard)
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit Claimed(_owner, msg.sender, amount);
    }

    // ---------- Views ----------

    /// @notice Full state of an owner's vault.
    function getVault(address _owner) external view returns (
        address beneficiary,
        uint256 balance,
        uint256 checkInInterval,
        uint256 lastCheckIn,
        string memory message,
        bool claimable
    ) {
        Vault storage v = vaults[_owner];
        require(v.exists, "No such vault");
        return (
            v.beneficiary,
            v.balance,
            v.checkInInterval,
            v.lastCheckIn,
            v.message,
            block.timestamp > v.lastCheckIn + v.checkInInterval
        );
    }

    /// @notice Seconds until a vault becomes claimable (0 if already claimable).
    function timeUntilClaimable(address _owner) external view returns (uint256) {
        Vault storage v = vaults[_owner];
        require(v.exists, "No such vault");
        uint256 deadline = v.lastCheckIn + v.checkInInterval;
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    /// @notice All vault owners who named the caller (or any address) as beneficiary.
    function vaultsLeftFor(address _beneficiary) external view returns (address[] memory) {
        return ownersForBeneficiary[_beneficiary];
    }
}
