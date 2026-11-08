
// This service handles the encryption/decryption of files before they hit the device storage.
// It ensures that data stored offline is secure.

const KEY_STORAGE_NAME = 'construction_pro_secure_key_v1';

export const cryptoService = {
    key: null as CryptoKey | null,

    // Initialize or Retrieve the unique Device Key
    async init() {
        if (this.key) return;

        try {
            const storedJson = localStorage.getItem(KEY_STORAGE_NAME);
            if (storedJson) {
                // Import existing key
                const jwk = JSON.parse(storedJson);
                this.key = await window.crypto.subtle.importKey(
                    'jwk',
                    jwk,
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                );
            } else {
                // Generate new random key for this device
                this.key = await window.crypto.subtle.generateKey(
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                );
                // Export and save to localStorage (The Key to the Safe)
                const jwk = await window.crypto.subtle.exportKey('jwk', this.key);
                localStorage.setItem(KEY_STORAGE_NAME, JSON.stringify(jwk));
            }
        } catch (e) {
            console.error("Crypto Init Failed:", e);
            throw new Error("Security Subsystem Failed");
        }
    },

    // Encrypt a File Blob -> Returns Encrypted Package
    async encrypt(blob: Blob): Promise<{ iv: Uint8Array, data: ArrayBuffer, type: string }> {
        await this.init();
        if (!this.key) throw new Error("No Encryption Key");

        // Generate random Initialization Vector (IV) - unique per file
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const buffer = await blob.arrayBuffer();

        const encryptedData = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.key,
            buffer
        );

        return {
            iv: iv,
            data: encryptedData,
            type: blob.type // Save MIME type to restore later
        };
    },

    // Decrypt Package -> Returns Original File Blob
    async decrypt(pkg: { iv: Uint8Array, data: ArrayBuffer, type: string }): Promise<Blob> {
        await this.init();
        if (!this.key) throw new Error("No Encryption Key");

        try {
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: pkg.iv as BufferSource },
                this.key,
                pkg.data
            );
            return new Blob([decryptedBuffer], { type: pkg.type });
        } catch (e) {
            console.error("Decryption Failed - Data might be corrupted or wrong key");
            throw e;
        }
    }
};
