// CSV serialization/deserialization (UTF-8 with BOM, CRLF line endings)
// Follows RFC 4180 with double-quote escaping

const BOM = '\uFEFF';
const CRLF = '\r\n';

function quoteField(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(quoteField).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => quoteField(row[h])).join(','));
  }
  return BOM + lines.join(CRLF) + CRLF;
}

export function parseCsv(text) {
  // Strip BOM if present
  let input = text;
  if (input.charCodeAt(0) === 0xFEFF) input = input.slice(1);

  const rows = [];
  let i = 0;
  const len = input.length;

  function parseField() {
    if (i >= len) return '';

    if (input[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let value = '';
      while (i < len) {
        if (input[i] === '"') {
          if (i + 1 < len && input[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          value += input[i];
          i++;
        }
      }
      return value;
    }

    // Unquoted field
    let value = '';
    while (i < len && input[i] !== ',' && input[i] !== '\r' && input[i] !== '\n') {
      value += input[i];
      i++;
    }
    return value;
  }

  function parseLine() {
    const fields = [];
    fields.push(parseField());

    while (i < len && input[i] === ',') {
      i++; // skip comma
      fields.push(parseField());
    }

    // Skip line ending
    if (i < len && input[i] === '\r') i++;
    if (i < len && input[i] === '\n') i++;

    return fields;
  }

  // Parse header
  if (i >= len) return { headers: [], rows: [] };
  const headers = parseLine();

  // Parse data rows
  while (i < len) {
    // Skip empty lines at end
    if (input[i] === '\r' || input[i] === '\n') {
      i++;
      continue;
    }
    const fields = parseLine();
    if (fields.length === 1 && fields[0] === '') continue; // skip empty lines
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < fields.length ? fields[j] : '';
    }
    rows.push(row);
  }

  return { headers, rows };
}
