/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Shared by the browser app and the Node server (no DOM APIs).
/**
 * Sanitizes a string, replacing or removing characters that cannot be encoded by standard PDF fonts 
 * in pdf-lib (WinAnsi / Windows-1252) with safe representations to prevent runtime crashes.
 */
export function sanitizeForWinAnsi(text: string): string {
  if (!text) return '';
  
  const winAnsiSafeCodes = new Set<number>([
    9, 10, 13, // controls
    352, 353, // Š, š
    381, 382, // Ž, ...
    338, 339, // Œ, œ
    376, // Ÿ
    8211, 8212, // en dash, em dash
    8216, 8217, 8218, // single quotes
    8220, 8221, 8222, // double quotes
    8224, 8225, // dagger, double dagger
    8226, // bullet
    8230, // ellipsis
    8364, // €
    8482, // ™
  ]);

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    
    // Check if within basic printable ASCII:
    if (code >= 32 && code <= 126) {
      result += char;
    } else if (code === 10 || code === 13 || code === 9) {
      result += char;
    } else if (code >= 160 && code <= 255) {
      result += char;
    } else if (winAnsiSafeCodes.has(code)) {
      result += char;
    } else {
      // Common look-alikes
      if (code === 8216 || code === 8217) result += "'";
      else if (code === 8220 || code === 8221) result += '"';
      else if (code === 8211 || code === 8212) result += '-';
      else if (code === 8230) result += '...';
      else {
        // Fallback for non-Latin characters (like Arabic, Russian, Chinese, Hebrew etc.)
        // This avoids crashing the standard Helvetica font drawing!
        result += '?';
      }
    }
  }
  return result;
}

/**
 * Loads a file into an ArrayBuffer
 */
