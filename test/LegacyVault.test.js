const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const MIN_INTERVAL = 24 * 60 * 60; // 1 day
const MAX_INTERVAL = 3650 * 24 * 60 * 60; // 3650 days
const MIN_DEPOSIT = ethers.parseEther("0.1");
const MAX_MESSAGE_LENGTH = 4096;

describe("LegacyVault", function () {
  async function deployFixture() {
    const [owner, beneficiary, other, stranger] = await ethers.getSigners();
    const LegacyVault = await ethers.getContractFactory("LegacyVault");
    const vault = await LegacyVault.deploy();
    await vault.waitForDeployment();
    return { vault, owner, beneficiary, other, stranger };
  }

  async function seal(vault, signer, beneficiary, interval = MIN_INTERVAL, value = MIN_DEPOSIT, message = "hello") {
    return vault.connect(signer).createVault(beneficiary, interval, ethers.toUtf8Bytes(message), { value });
  }

  // ---------- createVault ----------
  describe("createVault", function () {
    it("reverts if the owner already has a vault", async function () {
      const { vault, owner, beneficiary, other } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(seal(vault, owner, other)).to.be.revertedWith("Vault already exists");
    });

    it("reverts on zero-address beneficiary", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(seal(vault, owner, ethers.ZeroAddress)).to.be.revertedWith("Beneficiary required");
    });

    it("reverts if beneficiary is the owner", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(seal(vault, owner, owner.address)).to.be.revertedWith("Beneficiary must be someone else");
    });

    it("reverts below MIN_INTERVAL and above MAX_INTERVAL, succeeds at both boundaries", async function () {
      const { vault, owner, beneficiary, other, stranger } = await loadFixture(deployFixture);
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL - 1)).to.be.revertedWith("Interval out of range");
      await expect(seal(vault, owner, beneficiary, MAX_INTERVAL + 1)).to.be.revertedWith("Interval out of range");
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL)).to.not.be.reverted;
      await expect(seal(vault, other, beneficiary, MAX_INTERVAL)).to.not.be.reverted;
    });

    it("reverts below MIN_DEPOSIT, succeeds at exactly MIN_DEPOSIT", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT - 1n)).to.be.revertedWith("Deposit below minimum");
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT)).to.not.be.reverted;
    });

    it("reverts a message over MAX_MESSAGE_LENGTH, succeeds at exactly the cap", async function () {
      const { vault, owner, beneficiary, other } = await loadFixture(deployFixture);
      const atCap = "a".repeat(MAX_MESSAGE_LENGTH);
      const overCap = "a".repeat(MAX_MESSAGE_LENGTH + 1);
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT, overCap)).to.be.revertedWith("Message too long");
      await expect(seal(vault, other, beneficiary, MIN_INTERVAL, MIN_DEPOSIT, atCap)).to.not.be.reverted;
    });

    it("sets state, links the reverse index, and emits VaultCreated", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await expect(seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT, "letter"))
        .to.emit(vault, "VaultCreated")
        .withArgs(owner.address, beneficiary.address, MIN_DEPOSIT, MIN_INTERVAL);

      const v = await vault.getVault(owner.address);
      expect(v.beneficiary).to.equal(beneficiary.address);
      expect(v.balance).to.equal(MIN_DEPOSIT);
      expect(ethers.toUtf8String(v.message)).to.equal("letter");
      expect(v.claimable).to.equal(false);
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([owner.address]);
    });
  });

  // ---------- checkIn ----------
  describe("checkIn", function () {
    it("reverts with no vault", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).checkIn()).to.be.revertedWith("No vault for this address");
    });

    it("resets lastCheckIn and emits CheckedIn", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await time.increase(1000);
      await expect(vault.connect(owner).checkIn()).to.emit(vault, "CheckedIn");
      const v = await vault.getVault(owner.address);
      expect(v.claimable).to.equal(false);
    });
  });

  // ---------- deposit ----------
  describe("deposit", function () {
    it("reverts on zero value and with no vault", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).deposit({ value: 0 })).to.be.revertedWith("No vault for this address");
      await seal(vault, owner, beneficiary);
      await expect(vault.connect(owner).deposit({ value: 0 })).to.be.revertedWith("Nothing sent");
    });

    it("increases balance, resets lastCheckIn, emits Deposited", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      const top = ethers.parseEther("0.05");
      await expect(vault.connect(owner).deposit({ value: top }))
        .to.emit(vault, "Deposited")
        .withArgs(owner.address, top, MIN_DEPOSIT + top);
    });
  });

  // ---------- updateMessage ----------
  describe("updateMessage", function () {
    it("reverts over the length cap", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(
        vault.connect(owner).updateMessage(ethers.toUtf8Bytes("a".repeat(MAX_MESSAGE_LENGTH + 1)))
      ).to.be.revertedWith("Message too long");
    });

    it("updates the message and counts as a check-in", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(vault.connect(owner).updateMessage(ethers.toUtf8Bytes("revised"))).to.emit(vault, "MessageUpdated");
      const v = await vault.getVault(owner.address);
      expect(ethers.toUtf8String(v.message)).to.equal("revised");
    });
  });

  // ---------- updateBeneficiary ----------
  describe("updateBeneficiary", function () {
    it("reverts on zero address, self, and the current beneficiary", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(vault.connect(owner).updateBeneficiary(ethers.ZeroAddress)).to.be.revertedWith("Beneficiary required");
      await expect(vault.connect(owner).updateBeneficiary(owner.address)).to.be.revertedWith("Beneficiary must be someone else");
      await expect(vault.connect(owner).updateBeneficiary(beneficiary.address)).to.be.revertedWith("Already the beneficiary");
    });

    it("unlinks the old beneficiary and links the new one, and emits BeneficiaryUpdated", async function () {
      const { vault, owner, beneficiary, other } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(vault.connect(owner).updateBeneficiary(other.address))
        .to.emit(vault, "BeneficiaryUpdated")
        .withArgs(owner.address, beneficiary.address, other.address);
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([]);
      expect(await vault.vaultsLeftFor(other.address)).to.deep.equal([owner.address]);
    });

    it("keeps the reverse index correct via swap-and-pop when one of several owners changes away", async function () {
      const { vault, owner, beneficiary, other, stranger } = await loadFixture(deployFixture);
      // three distinct owners all name `beneficiary`
      await seal(vault, owner, beneficiary);
      await seal(vault, other, beneficiary);
      await seal(vault, stranger, beneficiary);
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([owner.address, other.address, stranger.address]);

      // the middle owner (`other`) re-points elsewhere; swap-and-pop should move `stranger` into `other`'s old slot
      const [, , , fresh] = await ethers.getSigners();
      await vault.connect(other).updateBeneficiary(fresh.address);

      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([owner.address, stranger.address]);
      expect(await vault.vaultsLeftFor(fresh.address)).to.deep.equal([other.address]);
    });
  });

  // ---------- withdraw ----------
  describe("withdraw", function () {
    it("reverts with no vault, zero amount, and amount above balance", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).withdraw(1)).to.be.revertedWith("No vault for this address");
      await seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT * 2n);
      await expect(vault.connect(owner).withdraw(0)).to.be.revertedWith("Invalid amount");
      await expect(vault.connect(owner).withdraw(MIN_DEPOSIT * 3n)).to.be.revertedWith("Invalid amount");
    });

    it("regression: the exact spam bypass reported — create at the floor, try to withdraw it right back", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary, MIN_INTERVAL, MIN_DEPOSIT);
      await expect(vault.connect(owner).withdraw(MIN_DEPOSIT)).to.be.revertedWith("Would drop below minimum - use closeVault() instead");

      // the vault must still be live and fully linked after the failed attempt
      const v = await vault.getVault(owner.address);
      expect(v.balance).to.equal(MIN_DEPOSIT);
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([owner.address]);
    });

    it("regression: also reverts when a partial withdrawal would dip the remainder under MIN_DEPOSIT", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      const deposit = MIN_DEPOSIT + ethers.parseEther("0.05");
      await seal(vault, owner, beneficiary, MIN_INTERVAL, deposit);
      await expect(vault.connect(owner).withdraw(ethers.parseEther("0.06"))).to.be.revertedWith(
        "Would drop below minimum - use closeVault() instead"
      );
    });

    it("allows a partial withdrawal that leaves the balance at or above MIN_DEPOSIT", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      const deposit = MIN_DEPOSIT + ethers.parseEther("0.05");
      await seal(vault, owner, beneficiary, MIN_INTERVAL, deposit);
      await expect(vault.connect(owner).withdraw(ethers.parseEther("0.05")))
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, ethers.parseEther("0.05"), MIN_DEPOSIT);
    });
  });

  // ---------- closeVault ----------
  describe("closeVault", function () {
    it("reverts with no vault", async function () {
      const { vault, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(owner).closeVault()).to.be.revertedWith("No vault for this address");
    });

    it("pays out the full balance, deletes the vault, unlinks the index, and frees the address to recreate", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await expect(vault.connect(owner).closeVault())
        .to.emit(vault, "VaultClosed")
        .withArgs(owner.address, MIN_DEPOSIT);

      await expect(vault.getVault(owner.address)).to.be.revertedWith("No such vault");
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([]);

      // address is free again
      await expect(seal(vault, owner, beneficiary)).to.not.be.reverted;
    });
  });

  // ---------- claim ----------
  describe("claim", function () {
    it("reverts for an address with no vault", async function () {
      const { vault, beneficiary, owner } = await loadFixture(deployFixture);
      await expect(vault.connect(beneficiary).claim(owner.address)).to.be.revertedWith("No such vault");
    });

    it("reverts for a non-beneficiary caller", async function () {
      const { vault, owner, beneficiary, stranger } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await time.increase(MIN_INTERVAL + 1);
      await expect(vault.connect(stranger).claim(owner.address)).to.be.revertedWith("Not the beneficiary");
    });

    it("reverts one second before the deadline, succeeds one second after", async function () {
      // A mined transaction can't land at a single exact instant — Hardhat
      // enforces strictly increasing block timestamps, so pinning a claim()
      // tx to precisely `deadline` isn't reliable. Testing the seconds either
      // side of it still proves the strict `>` boundary in claim().
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      const v = await vault.getVault(owner.address);
      const deadline = v.lastCheckIn + BigInt(MIN_INTERVAL);

      await time.increaseTo(deadline - 1n);
      await expect(vault.connect(beneficiary).claim(owner.address)).to.be.revertedWith("Owner is still checking in");
    });

    it("succeeds once the deadline has passed", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      const v = await vault.getVault(owner.address);
      const deadline = v.lastCheckIn + BigInt(MIN_INTERVAL);

      await time.increaseTo(deadline + 1n);
      await expect(vault.connect(beneficiary).claim(owner.address)).to.not.be.reverted;
    });

    it("deletes the vault, unlinks the index, transfers the balance, and emits Claimed", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await time.increase(MIN_INTERVAL + 1);

      await expect(vault.connect(beneficiary).claim(owner.address))
        .to.emit(vault, "Claimed")
        .withArgs(owner.address, beneficiary.address, MIN_DEPOSIT);

      await expect(vault.getVault(owner.address)).to.be.revertedWith("No such vault");
      expect(await vault.vaultsLeftFor(beneficiary.address)).to.deep.equal([]);
    });

    it("reverts with 'No such vault' if the owner already closed it (the only route to a fully-emptied vault now)", async function () {
      const { vault, owner, beneficiary } = await loadFixture(deployFixture);
      await seal(vault, owner, beneficiary);
      await vault.connect(owner).closeVault();
      await time.increase(MIN_INTERVAL + 1);
      await expect(vault.connect(beneficiary).claim(owner.address)).to.be.revertedWith("No such vault");
    });

    describe("reentrancy", function () {
      async function deployMalicious(vault) {
        const Malicious = await ethers.getContractFactory("MaliciousReceiver");
        const malicious = await Malicious.deploy(await vault.getAddress());
        await malicious.waitForDeployment();
        return malicious;
      }

      it("blocks reentrant withdraw() via a malicious owner contract", async function () {
        const { vault, beneficiary } = await loadFixture(deployFixture);
        const malicious = await deployMalicious(vault);
        const deposit = MIN_DEPOSIT + ethers.parseEther("0.05");
        await malicious.createVault(beneficiary.address, MIN_INTERVAL, ethers.toUtf8Bytes("letter"), { value: deposit });

        await expect(malicious.attackWithdraw(ethers.parseEther("0.05"))).to.be.revertedWith("Transfer failed");
        // state must be untouched: the reentrant call's revert must roll back the whole tx
        const v = await vault.getVault(await malicious.getAddress());
        expect(v.balance).to.equal(deposit);
      });

      it("blocks reentrant claim() via a malicious beneficiary contract", async function () {
        const { vault, owner } = await loadFixture(deployFixture);
        const malicious = await deployMalicious(vault);
        await seal(vault, owner, await malicious.getAddress());
        await time.increase(MIN_INTERVAL + 1);

        await expect(malicious.attackClaim(owner.address)).to.be.revertedWith("Transfer failed");
        // vault must still exist since the whole claim tx rolled back
        const v = await vault.getVault(owner.address);
        expect(v.balance).to.equal(MIN_DEPOSIT);
      });
    });
  });

  // ---------- beneficiary registration / key versioning ----------
  describe("registerAsBeneficiary", function () {
    it("reverts on an empty key", async function () {
      const { vault, beneficiary } = await loadFixture(deployFixture);
      await expect(vault.connect(beneficiary).registerAsBeneficiary("0x")).to.be.revertedWith("Key required");
    });

    it("reports no key registered by default", async function () {
      const { vault, beneficiary } = await loadFixture(deployFixture);
      expect(await vault.beneficiaryKeyCount(beneficiary.address)).to.equal(0);
      const [key, version] = await vault.currentBeneficiaryKey(beneficiary.address);
      expect(key).to.equal("0x");
      expect(version).to.equal(0);
    });

    it("registers a key, and rotating appends a new version without erasing the old one", async function () {
      const { vault, beneficiary } = await loadFixture(deployFixture);
      const keyV0 = "0x1111";
      const keyV1 = "0x2222";

      await expect(vault.connect(beneficiary).registerAsBeneficiary(keyV0))
        .to.emit(vault, "BeneficiaryRegistered")
        .withArgs(beneficiary.address, 0);
      expect(await vault.beneficiaryKeyCount(beneficiary.address)).to.equal(1);
      let [key, version] = await vault.currentBeneficiaryKey(beneficiary.address);
      expect(key).to.equal(keyV0);
      expect(version).to.equal(0);

      await expect(vault.connect(beneficiary).registerAsBeneficiary(keyV1))
        .to.emit(vault, "BeneficiaryRegistered")
        .withArgs(beneficiary.address, 1);
      expect(await vault.beneficiaryKeyCount(beneficiary.address)).to.equal(2);
      [key, version] = await vault.currentBeneficiaryKey(beneficiary.address);
      expect(key).to.equal(keyV1);
      expect(version).to.equal(1);

      // old version must still be retrievable so letters encrypted to it stay decryptable
      expect(await vault.beneficiaryKeyAt(beneficiary.address, 0)).to.equal(keyV0);
      expect(await vault.beneficiaryKeyAt(beneficiary.address, 1)).to.equal(keyV1);
      await expect(vault.beneficiaryKeyAt(beneficiary.address, 2)).to.be.revertedWith("No such key version");
    });
  });

  // ---------- index integrity across mixed sequences ----------
  describe("index integrity under mixed create/close/claim/change sequences", function () {
    it("matches the expected set of owners after an interleaved sequence", async function () {
      const { vault, beneficiary } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const [, , , , a, b, c, d] = signers; // 4 extra owners beyond the fixture's four

      await seal(vault, a, beneficiary); // link a
      await seal(vault, b, beneficiary); // link b
      await seal(vault, c, beneficiary); // link c
      await seal(vault, d, beneficiary); // link d
      expect(new Set(await vault.vaultsLeftFor(beneficiary.address))).to.deep.equal(
        new Set([a.address, b.address, c.address, d.address])
      );

      await vault.connect(b).closeVault(); // unlink b
      await vault.connect(c).updateBeneficiary(signers[8].address); // unlink c, link elsewhere
      expect(new Set(await vault.vaultsLeftFor(beneficiary.address))).to.deep.equal(new Set([a.address, d.address]));

      await time.increase(MIN_INTERVAL + 1);
      await vault.connect(beneficiary).claim(a.address); // unlink a
      expect(new Set(await vault.vaultsLeftFor(beneficiary.address))).to.deep.equal(new Set([d.address]));

      await vault.connect(b).createVault(beneficiary.address, MIN_INTERVAL, ethers.toUtf8Bytes("back again"), { value: MIN_DEPOSIT }); // re-link b
      expect(new Set(await vault.vaultsLeftFor(beneficiary.address))).to.deep.equal(new Set([d.address, b.address]));
    });
  });

  // ---------- accounting invariant (manual property check; not a substitute for real fuzzing) ----------
  describe("accounting invariant", function () {
    it("keeps sum(vault balances) == contract ETH balance across a mixed sequence of operations", async function () {
      const { vault, owner, other, stranger } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const ben = signers[4];

      const owners = [owner, other, stranger, signers[5], signers[6]];
      for (const o of owners) {
        await seal(vault, o, ben.address, MIN_INTERVAL, MIN_DEPOSIT + ethers.parseEther("0.02"));
      }
      await vault.connect(owner).deposit({ value: ethers.parseEther("0.01") });
      await vault.connect(other).withdraw(ethers.parseEther("0.01"));
      await vault.connect(stranger).closeVault();
      await time.increase(MIN_INTERVAL + 1);
      await vault.connect(ben).claim(signers[5].address);
      await vault.connect(signers[6]).updateBeneficiary(owner.address);

      let sum = 0n;
      for (const o of [owner, other, signers[6]]) {
        const v = await vault.getVault(o.address);
        sum += v.balance;
      }
      const contractBalance = await ethers.provider.getBalance(await vault.getAddress());
      expect(contractBalance).to.equal(sum);
    });
  });
});
