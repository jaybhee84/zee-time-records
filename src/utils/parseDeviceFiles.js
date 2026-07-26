/**
 * Decoders for files read off a ZKTeco USB flash-disk export via the
 * `read-usb-file` IPC channel, which always returns raw bytes as base64
 * (see main.js). Different files on the export need different treatment:
 *
 *   - attlog.dat      -> plain text, decode to a string and hand off to
 *                         parseAttlog() in parseAttlog.js
 *   - user.dat         -> binary, fixed 72-byte records
 *   - department.dat   -> binary, fixed 25-byte records
 *
 * user.dat / department.dat are NOT tab-delimited text (an earlier version
 * of this app assumed they were — that parser silently produced empty or
 * garbage results against a real device dump). The layout below was
 * confirmed by hand-decoding an actual export from this device; it also
 * matches independently documented ZKTeco 72-byte user record formats.
 */

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readCString(bytes, start, length) {
  let end = start;
  while (end < start + length && bytes[end] !== 0) end++;
  return new TextDecoder('latin1').decode(bytes.slice(start, end));
}

/** Decodes base64 back to a UTF-8 string, for text files like attlog.dat. */
export function base64ToText(base64) {
  return new TextDecoder('utf-8').decode(base64ToBytes(base64));
}

// ---- user.dat: fixed 72-byte binary records ----
//   offset 0      : privilege / role (1 byte, 0 = normal user)
//   offset 2-9    : password (8 bytes, ASCII, often empty)
//   offset 11-34  : name (24 bytes, ASCII, null-padded)
//   offset 35-38  : card number (4 bytes)
//   offset 39     : enabled flag (1 byte)
//   offset 48-71  : PIN / device user ID (24 bytes, ASCII, null-terminated)
const USER_RECORD_SIZE = 72;

/**
 * Parses a binary user.dat export.
 * @param {string} base64 - raw file bytes, base64-encoded (from readUsbFile)
 * @returns {Array<{ pin: string, name: string, privilege: number }>}
 */
export function parseUserDat(base64) {
  const bytes = base64ToBytes(base64);
  const users = [];

  for (
    let offset = 0;
    offset + USER_RECORD_SIZE <= bytes.length;
    offset += USER_RECORD_SIZE
  ) {
    const pin = readCString(bytes, offset + 48, 24).trim();
    if (!pin) continue; // empty / deleted slot

    const name = readCString(bytes, offset + 11, 24).trim();
    users.push({
      pin,
      name: name || `Device User ${pin}`,
      privilege: bytes[offset],
    });
  }

  return users;
}

// ---- department.dat: fixed 25-byte binary records ----
//   offset 0     : department id (1 byte)
//   offset 1-24  : department name (24 bytes, ASCII, null-padded)
const DEPT_RECORD_SIZE = 25;

/**
 * Parses a binary department.dat export.
 * @param {string} base64 - raw file bytes, base64-encoded (from readUsbFile)
 * @returns {Array<{ id: number, name: string }>}
 */
export function parseDepartmentDat(base64) {
  const bytes = base64ToBytes(base64);
  const departments = [];

  for (
    let offset = 0;
    offset + DEPT_RECORD_SIZE <= bytes.length;
    offset += DEPT_RECORD_SIZE
  ) {
    const name = readCString(bytes, offset + 1, 24).trim();
    if (!name) continue;
    departments.push({ id: bytes[offset], name });
  }

  return departments;
}