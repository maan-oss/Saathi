import crypto from 'node:crypto';

// Encrypts the saved profile with AES-256-GCM. The key comes from VAULT_KEY in .env, never from the data folder,
// so a copy of users.json alone is unreadable. Same interface as the browser stand-in used by the simulator.
const b64 = (b) => Buffer.from(b).toString('base64url');

export function createVault(secret) {
  const key = crypto.scryptSync(String(secret), 'saathi-vault-v1', 32);
  return {
    async seal(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return ['v1', b64(iv), b64(c.getAuthTag()), b64(ct)].join('.');
    },
    /** Returns the object, or null if the data was tampered with or the key is wrong. */
    async open(str) {
      try {
        const [v, iv, tag, ct] = String(str).split('.');
        if (v !== 'v1') return null;
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
        d.setAuthTag(Buffer.from(tag, 'base64url'));
        return JSON.parse(Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8'));
      } catch {
        return null;
      }
    },
  };
}
