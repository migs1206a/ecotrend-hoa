import logoData from '../assets/ecotrend-logo-pdf.json';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const TABLE_LEFT = 54;
const TABLE_WIDTH = PAGE_WIDTH - TABLE_LEFT * 2;
const HEADER_LOGO_Y = 704;
const HEADER_LOGO_SIZE = 54;
const HEADER_SUBTITLE_Y = 688;
const TABLE_LABEL_Y = 662;
const TABLE_TOP_Y = 652;
const BOTTOM_MARGIN = 54;
const CELL_PADDING_X = 6;
const CELL_PADDING_TOP = 8;
const BODY_FONT_SIZE = 9;
const HEADER_FONT_SIZE = 9;
const CELL_LINE_HEIGHT = 11;
const DEFAULT_ROW_HEIGHT = 30;
const DEFAULT_MAX_LINES = 14;
let cachedLogo = null;

export const normalizePdfText = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '');

const escapePdfText = (value) =>
  normalizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const formatNumber = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
};

const measureText = (text, fontSize = BODY_FONT_SIZE) =>
  Array.from(normalizePdfText(text)).reduce((width, char) => {
    if (/[ilI1.,' ]/.test(char)) return width + fontSize * 0.28;
    if (/[MW@#%&]/.test(char)) return width + fontSize * 0.72;
    return width + fontSize * 0.52;
  }, 0);

const addText = (commands, text, x, y, options = {}) => {
  const font = options.font || 'F1';
  const fontSize = options.size || BODY_FONT_SIZE;
  const align = options.align || 'left';
  const source = normalizePdfText(text);
  let textX = x;

  if (align === 'center') {
    textX = x - measureText(source, fontSize) / 2;
  } else if (align === 'right') {
    textX = x - measureText(source, fontSize);
  }

  commands.push(
    'BT',
    `/${font} ${fontSize} Tf`,
    `${formatNumber(textX)} ${formatNumber(y)} Td`,
    `(${escapePdfText(source)}) Tj`,
    'ET'
  );
};

const decodeBase64 = (value) => {
  if (typeof atob === 'function') return atob(value);
  if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('binary');
  return '';
};

const getLogo = () => {
  if (cachedLogo) return cachedLogo;
  if (!logoData?.width || !logoData?.height || !logoData?.rgb || !logoData?.alpha) return null;

  cachedLogo = {
    width: logoData.width,
    height: logoData.height,
    rgb: decodeBase64(logoData.rgb),
    alpha: decodeBase64(logoData.alpha)
  };

  return cachedLogo;
};

const addImage = (commands, name, x, y, width, height) => {
  commands.push(
    'q',
    `${formatNumber(width)} 0 0 ${formatNumber(height)} ${formatNumber(x)} ${formatNumber(y)} cm`,
    `/${name} Do`,
    'Q'
  );
};

const addPageHeader = (commands) => {
  const logo = getLogo();

  if (logo) {
    const logoWidth = HEADER_LOGO_SIZE * (logo.width / logo.height);
    addImage(commands, 'Logo', (PAGE_WIDTH - logoWidth) / 2, HEADER_LOGO_Y, logoWidth, HEADER_LOGO_SIZE);
  }

  addText(commands, 'Ecotrend Homeowners Association', PAGE_WIDTH / 2, HEADER_SUBTITLE_Y, {
    align: 'center',
    size: 10
  });
};

const splitLongWord = (word, maxChars) => {
  const chunks = [];
  let remaining = word;

  while (remaining.length > maxChars) {
    chunks.push(remaining.slice(0, maxChars));
    remaining = remaining.slice(maxChars);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

const wrapText = (value, width, fontSize = BODY_FONT_SIZE, maxLines = DEFAULT_MAX_LINES) => {
  const source = normalizePdfText(value).replace(/\s+/g, ' ').trim();
  if (!source) return [''];

  const maxChars = Math.max(4, Math.floor(width / (fontSize * 0.52)));
  const words = source.split(/\s+/).flatMap((word) => splitLongWord(word, maxChars));
  const lines = [];
  let current = '';

  words.forEach((word) => {
    if (lines.length >= maxLines) return;

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }

    if (current) lines.push(current);
    current = word;
  });

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].replace(/\s+$/, '').slice(0, Math.max(0, maxChars - 3))}...`;
  }

  return lines.length ? lines : [''];
};

const normalizeColumns = (columns) => {
  const source = Array.isArray(columns) && columns.length ? columns : [{ label: 'Field' }, { label: 'Details' }];
  const requestedWidth = source.reduce((sum, column) => sum + (Number(column.width) || 0), 0);
  const scale = requestedWidth > 0 ? TABLE_WIDTH / requestedWidth : 0;
  const equalWidth = TABLE_WIDTH / source.length;

  return source.map((column) => ({
    ...column,
    label: normalizePdfText(column.label || column.key || ''),
    width: requestedWidth > 0 ? (Number(column.width) || equalWidth) * scale : equalWidth
  }));
};

const getRowCells = (row, columns) => {
  if (Array.isArray(row)) return row;
  if (Array.isArray(row?.cells)) return row.cells;
  return columns.map((column) => row?.[column.key] ?? '');
};

const getRowMinimumHeight = (row, defaultHeight) => {
  if (row && !Array.isArray(row) && Number(row.minHeight)) {
    return Number(row.minHeight);
  }

  return defaultHeight;
};

const getLineGroups = (row, columns, fontSize, maxLines) =>
  getRowCells(row, columns).map((cell, index) =>
    wrapText(cell, Math.max(24, columns[index].width - CELL_PADDING_X * 2), fontSize, maxLines)
  );

const getRowHeight = (lineGroups, minimumHeight) => {
  const maxLines = lineGroups.reduce((max, group) => Math.max(max, group.length), 1);
  return Math.max(minimumHeight, CELL_PADDING_TOP + 7 + maxLines * CELL_LINE_HEIGHT);
};

const drawTableRow = (commands, lineGroups, columns, topY, height, options = {}) => {
  const bottomY = topY - height;
  const font = options.font || 'F1';
  const fontSize = options.size || BODY_FONT_SIZE;
  let x = TABLE_LEFT;

  commands.push('0.5 w');
  columns.forEach((column, index) => {
    commands.push(`${formatNumber(x)} ${formatNumber(bottomY)} ${formatNumber(column.width)} ${formatNumber(height)} re`, 'S');

    let textY = topY - CELL_PADDING_TOP - fontSize;
    const textX = x + CELL_PADDING_X;
    (lineGroups[index] || ['']).forEach((line) => {
      if (textY > bottomY + 4) {
        addText(commands, line, textX, textY, { font, size: fontSize });
      }
      textY -= CELL_LINE_HEIGHT;
    });

    x += column.width;
  });

  return bottomY;
};

const createPage = (tableTitle, continued) => {
  const commands = [];
  const title = normalizePdfText(tableTitle);
  const label = `TABLE:${title ? ` ${title}` : ''}${continued ? ' (continued)' : ''}`;

  addPageHeader(commands);
  addText(commands, label, TABLE_LEFT, TABLE_LABEL_Y, { font: 'F2', size: 10 });

  return {
    commands,
    cursorY: TABLE_TOP_Y
  };
};

const drawHeaderRow = (page, columns) => {
  const headerGroups = columns.map((column) =>
    wrapText(column.label, Math.max(24, column.width - CELL_PADDING_X * 2), HEADER_FONT_SIZE, 3)
  );
  const headerHeight = getRowHeight(headerGroups, DEFAULT_ROW_HEIGHT);
  page.cursorY = drawTableRow(page.commands, headerGroups, columns, page.cursorY, headerHeight, {
    font: 'F2',
    size: HEADER_FONT_SIZE
  });
};

const buildPdfFromStreams = (streams) => {
  const logo = getLogo();
  const hasLogo = Boolean(logo);
  const regularFontObjectNumber = 3 + streams.length;
  const boldFontObjectNumber = regularFontObjectNumber + 1;
  const logoImageObjectNumber = hasLogo ? boldFontObjectNumber + 1 : null;
  const logoMaskObjectNumber = hasLogo ? boldFontObjectNumber + 2 : null;
  const firstContentObjectNumber = boldFontObjectNumber + (hasLogo ? 3 : 1);
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Count ${streams.length} /Kids [${streams
      .map((_, index) => `${3 + index} 0 R`)
      .join(' ')}] >>\nendobj\n`
  ];
  const contentObjects = [];

  streams.forEach((stream, index) => {
    const contentObjectNumber = firstContentObjectNumber + index;
    const xObjectResources = hasLogo ? ` /XObject << /Logo ${logoImageObjectNumber} 0 R >>` : '';
    objects.push(
      `${3 + index} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontObjectNumber} 0 R /F2 ${boldFontObjectNumber} 0 R >>${xObjectResources} >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`
    );
    contentObjects.push(
      `${contentObjectNumber} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`
    );
  });

  objects.push(`${regularFontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`${boldFontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  if (hasLogo) {
    objects.push(
      `${logoImageObjectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${logoMaskObjectNumber} 0 R /Length ${logo.rgb.length} >>\nstream\n${logo.rgb}endstream\nendobj\n`
    );
    objects.push(
      `${logoMaskObjectNumber} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${logo.alpha.length} >>\nstream\n${logo.alpha}endstream\nendobj\n`
    );
  }

  objects.push(...contentObjects);

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

export const buildBrandedTablePdf = ({
  tableTitle = '',
  columns = [],
  rows = [],
  rowMinHeight = DEFAULT_ROW_HEIGHT,
  emptyMessage = 'No data available',
  maxLinesPerCell = DEFAULT_MAX_LINES
} = {}) => {
  const normalizedColumns = normalizeColumns(columns);
  const dataRows = Array.isArray(rows) && rows.length
    ? rows
    : [{ cells: [emptyMessage, ...Array(Math.max(0, normalizedColumns.length - 1)).fill('')], minHeight: rowMinHeight }];

  const pages = [];
  let page = createPage(tableTitle, false);
  drawHeaderRow(page, normalizedColumns);

  dataRows.forEach((row) => {
    const lineGroups = getLineGroups(row, normalizedColumns, BODY_FONT_SIZE, maxLinesPerCell);
    const rowHeight = getRowHeight(lineGroups, getRowMinimumHeight(row, rowMinHeight));

    if (page.cursorY - rowHeight < BOTTOM_MARGIN) {
      pages.push(page.commands.join('\n'));
      page = createPage(tableTitle, true);
      drawHeaderRow(page, normalizedColumns);
    }

    page.cursorY = drawTableRow(page.commands, lineGroups, normalizedColumns, page.cursorY, rowHeight);
  });

  pages.push(page.commands.join('\n'));
  return buildPdfFromStreams(pages);
};
