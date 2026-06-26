/**
 * jose v6 resolves to webapi builds that use `crypto.subtle`.
 * tsx + ESM can run without the Web Crypto global in dependency modules — install it from Node.
 */
import { webcrypto } from "node:crypto";

type CryptoGlobal = typeof globalThis & { crypto?: Crypto };

const g = globalThis as CryptoGlobal;

if (g.crypto === undefined) {
  g.crypto = webcrypto as Crypto;
}
