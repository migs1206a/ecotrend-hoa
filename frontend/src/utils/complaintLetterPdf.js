const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT_MARGIN = 54;
const TOP_START = 738;
const LINE_HEIGHT = 18;
const MAX_LINE_LENGTH = 72;

const normalizeAscii = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '');

const escapePdfText = (value) =>
  normalizeAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const wrapLine = (text, maxLength = MAX_LINE_LENGTH) => {
  const source = normalizeAscii(text).trim();
  if (!source) return [''];

  const words = source.split(/\s+/);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLength) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines;
};

const buildLetterLines = (complaint) => {
  const createdDate = new Date(complaint.createdAt || Date.now()).toLocaleDateString();
  const lines = [
    'ECOTREND HOA',
    'Homeowners Association',
    '',
    `Date: ${createdDate}`,
    '',
    'Address:',
    ...wrapLine(complaint.complainantAddress || '-'),
    '',
    'Complaint Against:',
    ...wrapLine(complaint.againstPersonName || '-'),
    '',
    'Message:',
    ...wrapLine(complaint.message || '-'),
    '',
    'Respectfully yours,',
    '',
    complaint.complainantName || '-',
    'ECOTREND HOA'
  ];

  return lines;
};

const buildContentStream = (lines) => {
  const commands = [
    'BT',
    '/F1 12 Tf',
    `${LINE_HEIGHT} TL`,
    `${LEFT_MARGIN} ${TOP_START} Td`
  ];

  lines.forEach((line, index) => {
    if (index > 0) commands.push('T*');
    commands.push(`(${escapePdfText(line)}) Tj`);
  });

  commands.push('ET');
  return `${commands.join('\n')}\n`;
};

const buildPdf = (contentStream) => {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdf;
};

export const downloadComplaintLetterPdf = (complaint) => {
  const lines = buildLetterLines(complaint);
  const stream = buildContentStream(lines);
  const pdf = buildPdf(stream);
  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileNameBase = normalizeAscii(complaint.againstPersonName || 'complaint-letter')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'complaint-letter';

  link.href = url;
  link.download = `${fileNameBase}-complaint-letter.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
