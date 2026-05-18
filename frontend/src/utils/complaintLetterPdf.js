import { buildBrandedTablePdf, normalizePdfText } from './brandedPdf';

const formatDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
};

const buildLetterRows = (complaint) => [
  { cells: ['Date', formatDate(complaint.createdAt)], minHeight: 34 },
  { cells: ['Complainant', complaint.complainantName || '-'], minHeight: 34 },
  { cells: ['Address', complaint.complainantAddress || '-'], minHeight: 46 },
  { cells: ['Complaint Against', complaint.againstPersonName || '-'], minHeight: 40 },
  { cells: ['Message', complaint.message || '-'], minHeight: 110 },
  { cells: ['Respectfully Yours', complaint.complainantName || '-'], minHeight: 44 },
  { cells: ['Association', 'Ecotrend HOA'], minHeight: 34 }
];

const toPdfBytes = (pdf) => Uint8Array.from(pdf, (character) => character.charCodeAt(0) & 0xff);

export const downloadComplaintLetterPdf = (complaint) => {
  const pdf = buildBrandedTablePdf({
    tableTitle: 'Complaint Letter',
    columns: [
      { label: 'Field', width: 160 },
      { label: 'Details', width: 344 }
    ],
    rows: buildLetterRows(complaint),
    rowMinHeight: 34,
    maxLinesPerCell: 18
  });
  const blob = new Blob([toPdfBytes(pdf)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileNameBase = normalizePdfText(complaint.againstPersonName || 'complaint-letter')
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
