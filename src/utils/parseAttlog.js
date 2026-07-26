/**
 * Parses a ZKTeco "attlog.dat" USB flash-disk export.
 *
 * Standard format is tab-delimited, one punch per line:
 *   PIN <TAB> YYYY-MM-DD HH:MM:SS <TAB> Status <TAB> VerifyMode <TAB> WorkCode ...
 *
 * Not every model tabs consistently (some use runs of spaces), so this parser
 * is lenient: it splits on tabs first, and falls back to whitespace-splitting
 * with a regex that keeps "YYYY-MM-DD HH:MM:SS" together.
 *
 * Returns: [{ pin, datetime (Date), status, verify, raw }]
 */
export function parseAttlog(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const records = [];

  for (const line of lines) {
    let fields = line.split('\t').map((f) => f.trim()).filter(Boolean);

    if (fields.length < 2) {
      // fallback: no tabs — pull "PIN", "date time", then the rest
      const match = line.match(
        /^(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*(.*)$/
      );
      if (!match) continue;
      const rest = match[3].split(/\s+/).filter(Boolean);
      fields = [match[1], match[2], ...rest];
    }

    const [pin, dateTimeStr, status, verify] = fields;
    if (!pin || !dateTimeStr) continue;

    const datetime = new Date(dateTimeStr.replace(' ', 'T'));
    if (isNaN(datetime.getTime())) continue;

    records.push({
      pin: String(pin),
      datetime,
      status: status ?? null,
      verify: verify ?? null,
      raw: line,
    });
  }

  return records;
}

// NOTE: user.dat is a binary file (fixed 72-byte records), not tab-delimited
// text — a text-based parseUserDat() used to live here but could never work
// against a real device export. Use parseUserDat() from parseDeviceFiles.js
// instead, which decodes the actual binary layout.