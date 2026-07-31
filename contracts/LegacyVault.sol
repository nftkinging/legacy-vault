// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Legacy Vault — a dead man's switch on BOT Chain
/// @notice Lock funds and a final message for a beneficiary. As long as you
///         keep checking in, nothing happens. If you go silent past your
///         chosen interval, the beneficiary can claim what you left behind.
/// @dev    One vault per owner address. Balances and vault state are zeroed
///         before any external call to preserve checks-effects-interactions.
///         Beneficiary model is hybrid: naming stays passive (no consent
///         required), but an address may optionally call
///         `registerAsBeneficiary` to publish an encryption key, letting the
///         owner encrypt the letter to that key instead of a shared
///         passphrase. Keys are versioned (never overwritten in place) so
///         rotating a key does not brick letters already encrypted to an
///         older version — the frontend records, inside the ciphertext
///         payload it stores in `message`, which version it targeted.
contract LegacyVault {
    uint256 public constant MIN_INTERVAL = 1 days;
    uint256 public constant MAX_INTERVAL = 3650 days;

    /// @dev Raises the cost of naming a stranger as beneficiary just to push
    ///      junk text into their inbox. Applies only to vault creation —
    ///      top-up deposits have no floor.
    uint256 public constant MIN_DEPOSIT = 0.1 ether;

    /// @dev Bounds `getVault` payload size and gas cost of create/update.
    ///      Sized with headroom over the plaintext-era 4096-byte guidance to
    ///      absorb base64 ciphertext overhead (~33%) plus a short version
    ///      prefix.
    uint256 public constant MAX_MESSAGE_LENGTH = 8192;

    struct Vault {
        address beneficiary;    // who can claim if the owner goes silent
        uint256 balance;        // BOT locked in the vault (wei)
        uint256 checkInInterval;// seconds of silence before claim unlocks
        uint256 lastCheckIn;    // timestamp of the owner's last proof of life
        string message;         // the letter left behind (may be enc:v1: ciphertext)
        bool exists;
    }

    mapping(address => Vault) private vaults;

    // reverse lookup: beneficiary => list of vault owners who named them
    mapping(address => address[]) private ownersForBeneficiary;
    // beneficiary => owner => (index in ownersForBeneficiary[beneficiary]) + 1; 0 = absent
    mapping(address => mapping(address => uint256)) private ownerIndexPos;

    // beneficiary => history of registered encryption public keys, oldest first.
    // Never overwritten — rotation appends a new version instead of mutating
    // the old one, so ciphertext encrypted to version N stays decryptable
    // after the beneficiary registers version N+1.
    mapping(address => bytes[]) private beneficiaryKeys;

    event VaultCreated(address indexed owner, address indexed beneficiary, uint256 amount, uint256 checkInInterval);
    event CheckedIn(address indexed owner, uint256 timestamp);
    event Deposited(address indexed owner, uint256 amount, uint256 newBalance);
    event MessageUpdated(address indexed owner);
    event Withdrawn(address indexed owner, uint256 amount, uint256 newBalance);
    event Claimed(address indexed owner, address indexed beneficiary, uint256 amount);
    event BeneficiaryUpdated(address indexed owner, address indexed oldBeneficiary, address indexed newBeneficiary);
    event VaultClosed(address indexed owner, uint256 amount);
    event BeneficiaryRegistered(address indexed beneficiary, uint256 keyVersion);

    modifier onlyVaultOwner() {
        require(vaults[msg.sender].exists, "No vault for this address");
        _;
    }

    // ---------- internal reverse-index maintenance ----------
    // Both are only ever invoked from functions gated on `onlyVaultOwner` or
    // from `claim`, which requires the beneficiary itself as msg.sender —
    // never callable directly, so there is no attacker-reachable path that
    // corrupts another owner's index entry.

    function _link(address _beneficiary, address _owner) private {
        address[] storage arr = ownersForBeneficiary[_beneficiary];
        arr.push(_owner);
        ownerIndexPos[_beneficiary][_owner] = arr.length; // store as length (pos + 1)
    }

    function _unlink(address _beneficiary, address _owner) private {
        uint256 posPlusOne = ownerIndexPos[_beneficiary][_owner];
        if (posPlusOne == 0) return;
        address[] storage arr = ownersForBeneficiary[_beneficiary];
        uint256 pos = posPlusOne - 1;
        uint256 lastIdx = arr.length - 1;
        if (pos != lastIdx) {
            address lastOwner = arr[lastIdx];
            arr[pos] = lastOwner;
            ownerIndexPos[_beneficiary][lastOwner] = pos + 1;
        }
        arr.pop();
        delete ownerIndexPos[_beneficiary][_owner];
    }

    /// @notice Create your vault. Send BOT along with the call to lock it.
    /// @dev Callable by anyone with no existing vault; naming a beneficiary
    ///      requires no consent from them (hybrid model — see contract docs).
    /// @param _beneficiary Who may claim if you go silent.
    /// @param _checkInInterval Seconds of silence before the claim unlocks.
    /// @param _message The letter revealed to your beneficiary.
    function createVault(address _beneficiary, uint256 _checkInInterval, string calldata _message) external payable {
        require(!vaults[msg.sender].exists, "Vault already exists");
        require(_beneficiary != address(0), "Beneficiary required");
        require(_beneficiary != msg.sender, "Beneficiary must be someone else");
        require(_checkInInterval >= MIN_INTERVAL && _checkInInterval <= MAX_INTERVAL, "Interval out of range");
        require(msg.value >= MIN_DEPOSIT, "Deposit below minimum");
        require(bytes(_message).length <= MAX_MESSAGE_LENGTH, "Message too long");

        vaults[msg.sender] = Vault({
            beneficiary: _beneficiary,
            balance: msg.value,
            checkInInterval: _checkInInterval,
            lastCheckIn: block.timestamp,
            message: _message,
            exists: true
        });
        _link(_beneficiary, msg.sender);

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
        require(bytes(_message).length <= MAX_MESSAGE_LENGTH, "Message too long");
        Vault storage v = vaults[msg.sender];
        v.message = _message;
        v.lastCheckIn = block.timestamp;
        emit MessageUpdated(msg.sender);
    }

    /// @notice Re-point your vault at a different beneficiary. Also counts as
    ///         a check-in. The old letter, if encrypted to the old
    ///         beneficiary's key or a shared passphrase, stays as-is — the
    ///         frontend should prompt for re-encryption via `updateMessage`.
    /// @dev Callable only by an existing vault's owner; only mutates that
    ///      owner's own vault and reverse-index entries.
    function updateBeneficiary(address _newBeneficiary) external onlyVaultOwner {
        require(_newBeneficiary != address(0), "Beneficiary required");
        require(_newBeneficiary != msg.sender, "Beneficiary must be someone else");
        Vault storage v = vaults[msg.sender];
        require(_newBeneficiary != v.beneficiary, "Already the beneficiary");
        address oldBeneficiary = v.beneficiary;
        _unlink(oldBeneficiary, msg.sender);
        v.beneficiary = _newBeneficiary;
        _link(_newBeneficiary, msg.sender);
        v.lastCheckIn = block.timestamp;
        emit BeneficiaryUpdated(msg.sender, oldBeneficiary, _newBeneficiary);
    }

    /// @notice Take funds back out. It's your money — allowed any time, but a
    ///         partial withdrawal cannot drop a live vault below MIN_DEPOSIT.
    ///         That floor exists to make naming a beneficiary cost something;
    ///         letting withdraw() empty the vault to zero while the vault
    ///         (and its beneficiary link) stays alive would make it free.
    ///         Use closeVault() to take everything and unlink for good.
    function withdraw(uint256 _amount) external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        require(_amount > 0 && _amount <= v.balance, "Invalid amount");
        uint256 newBalance = v.balance - _amount;
        require(newBalance >= MIN_DEPOSIT, "Would drop below minimum - use closeVault() instead");
        v.balance = newBalance;
        v.lastCheckIn = block.timestamp;
        (bool ok, ) = msg.sender.call{value: _amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, _amount, v.balance);
    }

    /// @notice Close your vault and withdraw everything left in it, freeing
    ///         the address to create a new vault later.
    /// @dev Callable only by an existing vault's owner; only affects that
    ///      owner's own vault and index entry.
    function closeVault() external onlyVaultOwner {
        Vault storage v = vaults[msg.sender];
        uint256 amount = v.balance;
        address beneficiary = v.beneficiary;
        delete vaults[msg.sender];
        _unlink(beneficiary, msg.sender);
        if (amount > 0) {
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "Transfer failed");
        }
        emit VaultClosed(msg.sender, amount);
    }

    /// @notice Beneficiary claims the vault of an owner who has gone silent.
    ///         Settles the vault permanently, even if the balance is zero,
    ///         so a beneficiary can never be blocked from formally claiming
    ///         (and, once encrypted, reading) a vault the owner emptied.
    /// @param _owner The vault owner's address.
    function claim(address _owner) external {
        Vault storage v = vaults[_owner];
        require(v.exists, "No such vault");
        require(msg.sender == v.beneficiary, "Not the beneficiary");
        require(block.timestamp > v.lastCheckIn + v.checkInInterval, "Owner is still checking in");
        uint256 amount = v.balance;
        address beneficiary = v.beneficiary;

        delete vaults[_owner];
        _unlink(beneficiary, _owner);

        if (amount > 0) {
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "Transfer failed");
        }

        emit Claimed(_owner, beneficiary, amount);
    }

    /// @notice Publish (or rotate) your encryption public key so owners who
    ///         name you can encrypt letters to it instead of a passphrase.
    ///         Purely additive — never overwrites a prior version, so
    ///         letters encrypted under an earlier version stay decryptable.
    /// @dev Callable by anyone, for their own address only. A hostile caller
    ///      can only spam their own key history (self-inflicted gas cost),
    ///      never another address's.
    /// @param _pubKey The new public key bytes.
    function registerAsBeneficiary(bytes calldata _pubKey) external {
        require(_pubKey.length > 0, "Key required");
        beneficiaryKeys[msg.sender].push(_pubKey);
        emit BeneficiaryRegistered(msg.sender, beneficiaryKeys[msg.sender].length - 1);
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

    /// @notice Number of encryption key versions a beneficiary has registered (0 = never).
    function beneficiaryKeyCount(address _beneficiary) external view returns (uint256) {
        return beneficiaryKeys[_beneficiary].length;
    }

    /// @notice The most recently registered key and its version index.
    ///         Returns ("", 0) if the beneficiary has never registered.
    function currentBeneficiaryKey(address _beneficiary) external view returns (bytes memory key, uint256 version) {
        uint256 len = beneficiaryKeys[_beneficiary].length;
        if (len == 0) return ("", 0);
        return (beneficiaryKeys[_beneficiary][len - 1], len - 1);
    }

    /// @notice A specific historical key version, so a letter encrypted to an
    ///         older version can still be decrypted after rotation.
    function beneficiaryKeyAt(address _beneficiary, uint256 _version) external view returns (bytes memory) {
        require(_version < beneficiaryKeys[_beneficiary].length, "No such key version");
        return beneficiaryKeys[_beneficiary][_version];
    }
}
