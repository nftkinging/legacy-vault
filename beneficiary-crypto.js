// Registered-beneficiary encryption — shared by app.html (owner sealing a
// letter, beneficiary claiming one) and register.html (key generation).
//
// Scheme: ECIES over P-256 (WebCrypto native, no external library).
// - registerAsBeneficiary(pubKey) on-chain stores a raw uncompressed P-256
//   public key (65 bytes) — opaque to the contract, meaningful only here.
// - To encrypt: generate a one-time ephemeral P-256 keypair, ECDH it
//   against the beneficiary's stored public key to get an AES-256 key
//   (P-256's shared secret is exactly 32 bytes, so no separate KDF step
//   is needed), AES-GCM-encrypt the letter, and include the ephemeral
//   public key in the payload so the beneficiary can redo the same ECDH
//   from their side.
// - Keys are versioned on-chain (rotation never overwrites); the payload
//   records which version it targeted so re-registering doesn't strand
//   older letters as long as the beneficiary still has the matching
//   private key backup.
//
// Payload layout: [1 byte format=2][4 bytes key version, big-endian]
//                 [65 bytes ephemeral public key][12 bytes IV]
//                 [ciphertext + 16-byte AES-GCM tag]
window.BeneficiaryCrypto = (() => {
  const FORMAT_VERSION_REGISTERED = 2;
  const EPHEMERAL_PUBKEY_LEN = 65;
  const IV_LEN = 12;
  const HEADER_LEN = 1 + 4 + EPHEMERAL_PUBKEY_LEN + IV_LEN;

  async function generateKeypair() {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    );
    const publicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return { publicKeyRaw, privateKeyJwk };
  }

  function importPublicKey(rawBytes) {
    return crypto.subtle.importKey('raw', rawBytes, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  }
  function importPrivateKey(jwk) {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  }

  async function encryptFor(plaintext, recipientPublicKeyRaw, keyVersion) {
    const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const recipientKey = await importPublicKey(recipientPublicKeyRaw);
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientKey }, ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const ephemeralPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext))
    );

    const payload = new Uint8Array(HEADER_LEN + ciphertext.length);
    payload[0] = FORMAT_VERSION_REGISTERED;
    payload[1] = (keyVersion >>> 24) & 0xff;
    payload[2] = (keyVersion >>> 16) & 0xff;
    payload[3] = (keyVersion >>> 8) & 0xff;
    payload[4] = keyVersion & 0xff;
    payload.set(ephemeralPubRaw, 5);
    payload.set(iv, 5 + EPHEMERAL_PUBKEY_LEN);
    payload.set(ciphertext, HEADER_LEN);
    return payload;
  }

  function isRegisteredKeyPayload(bytes) {
    return !!(bytes && bytes.length >= HEADER_LEN && bytes[0] === FORMAT_VERSION_REGISTERED);
  }

  function parsePayload(bytes) {
    if (!isRegisteredKeyPayload(bytes)) return null;
    const keyVersion = ((bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
    const ephemeralPubRaw = bytes.slice(5, 5 + EPHEMERAL_PUBKEY_LEN);
    const iv = bytes.slice(5 + EPHEMERAL_PUBKEY_LEN, HEADER_LEN);
    const ciphertext = bytes.slice(HEADER_LEN);
    return { keyVersion, ephemeralPubRaw, iv, ciphertext };
  }

  async function decryptWith(bytes, privateKeyJwk) {
    const parsed = parsePayload(bytes);
    if (!parsed) throw new Error('Not a registered-key payload');
    const privateKey = await importPrivateKey(privateKeyJwk);
    const ephemeralPubKey = await importPublicKey(parsed.ephemeralPubRaw);
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeralPubKey }, privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: parsed.iv }, aesKey, parsed.ciphertext);
    return new TextDecoder().decode(plaintext);
  }

  // ---- the beneficiary's own private-key backups, kept only on-device ----
  // Never uploaded anywhere — losing this (and not having saved the
  // downloaded backup file) means a letter encrypted to that key version
  // becomes unreadable, though the funds themselves stay claimable via
  // claim() regardless. Namespaced per chain + address + key version so
  // testnet/mainnet and key rotation never collide.
  function storageKey(chainId, address, version) {
    return `legacyvault:beneficiaryKey:${chainId}:${address.toLowerCase()}:${version}`;
  }
  function savePrivateKey(chainId, address, version, jwk) {
    localStorage.setItem(storageKey(chainId, address, version), JSON.stringify(jwk));
  }
  function loadPrivateKey(chainId, address, version) {
    const raw = localStorage.getItem(storageKey(chainId, address, version));
    return raw ? JSON.parse(raw) : null;
  }

  return {
    FORMAT_VERSION_REGISTERED,
    generateKeypair,
    encryptFor,
    decryptWith,
    isRegisteredKeyPayload,
    parsePayload,
    savePrivateKey,
    loadPrivateKey,
  };
})();
