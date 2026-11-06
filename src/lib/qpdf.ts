/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Standards-compliant PDF encryption/decryption powered by qpdf compiled to WebAssembly.
// The .wasm file is bundled with the app and loaded only when needed. Nothing is uploaded.
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';

type QpdfInstance = {
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
  };
};

async function runQpdf(args: string[], input: Uint8Array): Promise<{ code: number; output: Uint8Array | null }> {
  const { default: createModule } = await import('@neslinesli93/qpdf-wasm');
  const qpdf = (await (createModule as unknown as (opts: object) => Promise<QpdfInstance>)({
    locateFile: () => wasmUrl,
  })) as QpdfInstance;

  qpdf.FS.writeFile('/input.pdf', input);
  let code: number;
  try {
    code = qpdf.callMain([...args, '/input.pdf', '/output.pdf']);
  } catch (err: any) {
    code = typeof err?.status === 'number' ? err.status : 1;
  }
  let output: Uint8Array | null = null;
  try {
    output = qpdf.FS.readFile('/output.pdf');
  } catch {
    output = null;
  }
  return { code, output };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Incorrect password');
    this.name = 'WrongPasswordError';
  }
}

/** Encrypts a PDF with AES-256 so it opens in any PDF reader with the password. */
export async function encryptPdf(
  pdf: ArrayBuffer | Uint8Array,
  userPassword: string,
  ownerPassword: string = userPassword
): Promise<Uint8Array> {
  const { code, output } = await runQpdf(['--encrypt', userPassword, ownerPassword, '256', '--'], new Uint8Array(pdf));
  // qpdf exit code 3 = success with warnings
  if ((code !== 0 && code !== 3) || !output) {
    throw new Error(`Could not encrypt this PDF (qpdf exit code ${code})`);
  }
  return output;
}

/** Removes password protection from a standard encrypted PDF. */
export async function decryptPdf(pdf: ArrayBuffer | Uint8Array, password: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(pdf);
  const { code, output } = await runQpdf([`--password=${password}`, '--decrypt'], bytes);
  if ((code !== 0 && code !== 3) || !output) {
    // qpdf reports details only on the console; an encrypted file that fails to open means a wrong password.
    if (isEncrypted(bytes)) throw new WrongPasswordError();
    throw new Error(`Could not unlock this PDF (qpdf exit code ${code})`);
  }
  return output;
}

/** True if the PDF declares an /Encrypt dictionary (stored unencrypted in the trailer or xref stream). */
export function isEncrypted(bytes: Uint8Array): boolean {
  const text = new TextDecoder('latin1').decode(bytes);
  return /\/Encrypt\s/.test(text);
}
