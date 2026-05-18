const logoData = require('../assets/ecotrend-logo-pdf.json');

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
const REPORT_COLORS = {
  green: [0.06, 0.28, 0.2],
  greenSoft: [0.91, 0.97, 0.94],
  greenPale: [0.96, 0.99, 0.97],
  border: [0.78, 0.84, 0.8],
  grid: [0.86, 0.89, 0.87],
  text: [0.12, 0.16, 0.15],
  muted: [0.39, 0.45, 0.43],
  white: [1, 1, 1],
  panel: [0.97, 0.98, 0.97],
  stripe: [0.985, 0.99, 0.985]
};
let cachedLogo = null;

const normalizePdfText = (value) =>
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

const colorCommand = (color, operator) => {
  if (!Array.isArray(color) || color.length < 3) return '';
  return `${color.slice(0, 3).map(formatNumber).join(' ')} ${operator}`;
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

  const color = colorCommand(options.color, 'rg');
  if (color) {
    commands.push('q', color);
  }

  commands.push(
    'BT',
    `/${font} ${fontSize} Tf`,
    `${formatNumber(textX)} ${formatNumber(y)} Td`,
    `(${escapePdfText(source)}) Tj`,
    'ET'
  );

  if (color) {
    commands.push('Q');
  }
};

const decodeBase64 = (value) => Buffer.from(value, 'base64').toString('binary');

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

const addRect = (commands, x, y, width, height, options = {}) => {
  const fill = colorCommand(options.fill, 'rg');
  const stroke = colorCommand(options.stroke, 'RG');
  const lineWidth = Number(options.lineWidth || 0.5);

  commands.push('q');
  if (fill) commands.push(fill);
  if (stroke) commands.push(stroke);
  commands.push(`${formatNumber(lineWidth)} w`);

  if (fill && stroke) {
    commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`, 'B');
  } else if (fill) {
    commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`, 'f');
  } else {
    commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re`, 'S');
  }

  commands.push('Q');
};

const addLine = (commands, x1, y1, x2, y2, options = {}) => {
  const stroke = colorCommand(options.stroke || REPORT_COLORS.grid, 'RG');
  const lineWidth = Number(options.lineWidth || 0.5);

  commands.push(
    'q',
    stroke,
    `${formatNumber(lineWidth)} w`,
    `${formatNumber(x1)} ${formatNumber(y1)} m`,
    `${formatNumber(x2)} ${formatNumber(y2)} l`,
    'S',
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

const buildPdfFromStreams = (streams, options = {}) => {
  const pageWidth = Number(options.pageWidth) || PAGE_WIDTH;
  const pageHeight = Number(options.pageHeight) || PAGE_HEIGHT;
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
      `${3 + index} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontObjectNumber} 0 R /F2 ${boldFontObjectNumber} 0 R >>${xObjectResources} >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`
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

const buildBrandedTablePdf = ({
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

const getReportPageDimensions = (pageSize = 'a4', orientation = 'landscape') => {
  const sizes = {
    a4: { width: 595, height: 842 },
    letter: { width: PAGE_WIDTH, height: PAGE_HEIGHT }
  };
  const selected = sizes[String(pageSize).toLowerCase()] || sizes.a4;
  const isLandscape = String(orientation).toLowerCase() === 'landscape';

  return isLandscape
    ? { pageWidth: Math.max(selected.width, selected.height), pageHeight: Math.min(selected.width, selected.height) }
    : { pageWidth: Math.min(selected.width, selected.height), pageHeight: Math.max(selected.width, selected.height) };
};

const chunkItems = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizeReportColumns = (columns, tableWidth) => {
  const source = Array.isArray(columns) && columns.length
    ? columns
    : [{ key: 'label', label: 'Details', width: tableWidth }];
  const requestedWidth = source.reduce((sum, column) => sum + (Number(column.width) || 0), 0);
  const equalWidth = tableWidth / source.length;
  const scale = requestedWidth > 0 ? tableWidth / requestedWidth : 0;

  return source.map((column) => ({
    ...column,
    label: normalizePdfText(column.label || column.key || ''),
    width: requestedWidth > 0 ? (Number(column.width) || equalWidth) * scale : equalWidth
  }));
};

const drawWrappedText = (commands, text, x, y, width, options = {}) => {
  const fontSize = Number(options.size) || BODY_FONT_SIZE;
  const lineHeight = Number(options.lineHeight) || fontSize + 3;
  const lines = wrapText(text, width, fontSize, Number(options.maxLines) || DEFAULT_MAX_LINES);

  lines.forEach((line, index) => {
    addText(commands, line, x, y - index * lineHeight, options);
  });

  return y - lines.length * lineHeight;
};

const addReportHeader = (commands, context, continued) => {
  const { pageWidth, pageHeight, marginX, title, generatedOnLabel } = context;
  const logo = getLogo();
  const logoSize = 38;
  const headerTop = pageHeight - 34;
  const logoY = pageHeight - 72;
  const textX = logo ? marginX + logoSize + 12 : marginX;

  if (logo) {
    const logoWidth = logoSize * (logo.width / logo.height);
    addImage(commands, 'Logo', marginX, logoY, logoWidth, logoSize);
  }

  addText(commands, 'Ecotrend Homeowners Association', textX, headerTop, {
    font: 'F2',
    size: 11,
    color: REPORT_COLORS.green
  });
  addText(commands, 'Administrative Report', textX, headerTop - 15, {
    size: 8,
    color: REPORT_COLORS.muted
  });
  addText(commands, 'Confidential - For HOA Administrative Use Only', pageWidth - marginX, headerTop, {
    align: 'right',
    font: 'F2',
    size: 8,
    color: REPORT_COLORS.green
  });
  addText(commands, generatedOnLabel, pageWidth - marginX, headerTop - 15, {
    align: 'right',
    size: 8,
    color: REPORT_COLORS.muted
  });
  addText(commands, `${title}${continued ? ' (continued)' : ''}`, marginX, pageHeight - 94, {
    font: 'F2',
    size: 17,
    color: REPORT_COLORS.text
  });
  addLine(commands, marginX, pageHeight - 106, pageWidth - marginX, pageHeight - 106, {
    stroke: REPORT_COLORS.green,
    lineWidth: 1
  });
};

const createReportPage = (context, continued = false) => {
  const commands = [];
  addReportHeader(commands, context, continued);
  return {
    commands,
    cursorY: context.pageHeight - 126
  };
};

const addReportFooter = (commands, context, pageNumber, pageCount) => {
  const { pageWidth, marginX, title, generatedOnLabel } = context;
  const footerY = 26;

  addLine(commands, marginX, footerY + 17, pageWidth - marginX, footerY + 17, {
    stroke: REPORT_COLORS.grid
  });
  addText(commands, title, marginX, footerY, {
    size: 7,
    color: REPORT_COLORS.muted
  });
  addText(commands, 'Confidential - EcoTrend HOA Atlas', pageWidth / 2, footerY, {
    align: 'center',
    size: 7,
    color: REPORT_COLORS.muted
  });
  addText(commands, `Page ${pageNumber} of ${pageCount}`, pageWidth - marginX, footerY, {
    align: 'right',
    size: 7,
    color: REPORT_COLORS.muted
  });
  addText(commands, generatedOnLabel, pageWidth - marginX, footerY - 10, {
    align: 'right',
    size: 6.5,
    color: REPORT_COLORS.muted
  });
};

const drawInfoPanel = (page, context, metadata) => {
  const items = Array.isArray(metadata) ? metadata.filter((item) => item?.label) : [];
  if (!items.length) return;

  const rows = chunkItems(items, 4);
  const panelHeight = 28 + rows.length * 36;
  const panelY = page.cursorY - panelHeight;

  addRect(page.commands, context.marginX, panelY, context.contentWidth, panelHeight, {
    fill: REPORT_COLORS.panel,
    stroke: REPORT_COLORS.border
  });
  addText(page.commands, 'Report Information', context.marginX + 12, page.cursorY - 18, {
    font: 'F2',
    size: 9,
    color: REPORT_COLORS.green
  });

  rows.forEach((row, rowIndex) => {
    const cellWidth = context.contentWidth / 4;
    const rowTop = page.cursorY - 34 - rowIndex * 36;

    row.forEach((item, itemIndex) => {
      const cellX = context.marginX + itemIndex * cellWidth + 12;
      addText(page.commands, item.label, cellX, rowTop, {
        font: 'F2',
        size: 6.8,
        color: REPORT_COLORS.muted
      });
      drawWrappedText(page.commands, item.value || 'N/A', cellX, rowTop - 12, cellWidth - 22, {
        size: 8,
        maxLines: 2,
        lineHeight: 9,
        color: REPORT_COLORS.text
      });
    });
  });

  page.cursorY = panelY - 16;
};

const drawSummaryCards = (page, context, summaryItems) => {
  const items = Array.isArray(summaryItems) ? summaryItems.filter((item) => item?.label) : [];
  if (!items.length) return;

  addText(page.commands, 'Executive Summary', context.marginX, page.cursorY, {
    font: 'F2',
    size: 10,
    color: REPORT_COLORS.green
  });
  page.cursorY -= 12;

  const cardsPerRow = Math.min(4, Math.max(1, items.length));
  const gap = 8;
  const cardWidth = (context.contentWidth - gap * (cardsPerRow - 1)) / cardsPerRow;
  const cardHeight = 42;

  chunkItems(items, cardsPerRow).forEach((row) => {
    row.forEach((item, index) => {
      const cardX = context.marginX + index * (cardWidth + gap);
      const cardY = page.cursorY - cardHeight;
      addRect(page.commands, cardX, cardY, cardWidth, cardHeight, {
        fill: REPORT_COLORS.greenSoft,
        stroke: REPORT_COLORS.border
      });
      addText(page.commands, item.label, cardX + 10, page.cursorY - 13, {
        font: 'F2',
        size: 6.8,
        color: REPORT_COLORS.muted
      });
      drawWrappedText(page.commands, item.value || '0', cardX + 10, page.cursorY - 28, cardWidth - 20, {
        font: 'F2',
        size: 12,
        maxLines: 1,
        color: REPORT_COLORS.green
      });
    });

    page.cursorY -= cardHeight + 9;
  });

  page.cursorY -= 3;
};

const getReportCellValue = (row, column, rowIndex, columnIndex) => {
  if (column.key === '__rowNumber') return rowIndex + 1;
  if (typeof column.value === 'function') return column.value(row, rowIndex);
  if (Array.isArray(row)) return row[columnIndex] ?? '';
  return row?.[column.key] ?? '';
};

const getReportLineGroups = (row, columns, rowIndex, fontSize, maxLines) =>
  columns.map((column, columnIndex) =>
    wrapText(
      getReportCellValue(row, column, rowIndex, columnIndex),
      Math.max(14, column.width - 10),
      fontSize,
      maxLines
    )
  );

const getReportRowHeight = (lineGroups, minimumHeight, lineHeight) => {
  const maxLines = lineGroups.reduce((max, group) => Math.max(max, group.length), 1);
  return Math.max(minimumHeight, 12 + maxLines * lineHeight);
};

const drawReportTableRow = (commands, columns, lineGroups, x, topY, height, options = {}) => {
  const bottomY = topY - height;
  const font = options.font || 'F1';
  const fontSize = Number(options.size) || 7.5;
  const lineHeight = Number(options.lineHeight) || fontSize + 2;
  const textColor = options.textColor || REPORT_COLORS.text;
  const fill = options.fill || REPORT_COLORS.white;
  const stroke = options.stroke || REPORT_COLORS.grid;
  let cellX = x;

  columns.forEach((column, index) => {
    addRect(commands, cellX, bottomY, column.width, height, {
      fill,
      stroke,
      lineWidth: 0.35
    });

    const align = column.align || 'left';
    const textX = align === 'right'
      ? cellX + column.width - 5
      : align === 'center'
        ? cellX + column.width / 2
        : cellX + 5;
    let textY = topY - 7 - fontSize;

    (lineGroups[index] || ['']).forEach((line) => {
      if (textY > bottomY + 4) {
        addText(commands, line, textX, textY, {
          font,
          size: fontSize,
          align,
          color: textColor
        });
      }
      textY -= lineHeight;
    });

    cellX += column.width;
  });

  return bottomY;
};

const drawCertificationSection = (page, context) => {
  const sectionTop = page.cursorY;

  addText(page.commands, 'Certification', context.marginX, sectionTop, {
    font: 'F2',
    size: 10,
    color: REPORT_COLORS.green
  });
  drawWrappedText(
    page.commands,
    'This report was generated from EcoTrend HOA Atlas records and is intended for authorized HOA administrative review, filing, and official reference.',
    context.marginX,
    sectionTop - 16,
    context.contentWidth,
    {
      size: 8,
      maxLines: 2,
      lineHeight: 10,
      color: REPORT_COLORS.muted
    }
  );

  const labels = ['Prepared By', 'Reviewed By', 'Approved By'];
  const gap = 18;
  const lineWidth = (context.contentWidth - gap * 2) / 3;
  const lineY = sectionTop - 70;

  labels.forEach((label, index) => {
    const lineX = context.marginX + index * (lineWidth + gap);
    addLine(page.commands, lineX, lineY, lineX + lineWidth, lineY, {
      stroke: REPORT_COLORS.text
    });
    addText(page.commands, label, lineX + lineWidth / 2, lineY - 13, {
      align: 'center',
      font: 'F2',
      size: 7.5,
      color: REPORT_COLORS.text
    });
    addText(page.commands, 'Name / Signature / Date', lineX + lineWidth / 2, lineY - 24, {
      align: 'center',
      size: 6.5,
      color: REPORT_COLORS.muted
    });
  });

  page.cursorY = lineY - 38;
};

const buildBrandedReportPdf = ({
  title = 'Administrative Report',
  generatedOn = new Date(),
  generatedBy = 'ADMIN',
  filename = '',
  scope = 'All available records as of generation time',
  columns = [],
  rows = [],
  summaryItems = [],
  emptyMessage = 'No records available',
  pageSize = 'a4',
  orientation = 'landscape',
  includeRowNumbers = true,
  maxLinesPerCell = 2
} = {}) => {
  const { pageWidth, pageHeight } = getReportPageDimensions(pageSize, orientation);
  const generatedDate = generatedOn instanceof Date ? generatedOn : new Date(generatedOn);
  const generatedOnLabel = Number.isNaN(generatedDate.getTime())
    ? ''
    : generatedDate.toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  const context = {
    title: normalizePdfText(title),
    generatedOnLabel,
    pageWidth,
    pageHeight,
    marginX: 36,
    bottomMargin: 58
  };
  context.contentWidth = context.pageWidth - context.marginX * 2;

  const metadata = [
    { label: 'Generated On', value: generatedOnLabel },
    { label: 'Generated By', value: generatedBy || 'ADMIN' },
    { label: 'Total Records', value: String(Array.isArray(rows) ? rows.length : 0) },
    { label: 'Report File', value: filename || 'Pending archive filename' },
    { label: 'Scope', value: scope }
  ];
  const rawColumns = includeRowNumbers
    ? [{ key: '__rowNumber', label: 'No.', width: 34, align: 'right' }, ...columns]
    : columns;
  const tableColumns = normalizeReportColumns(rawColumns, context.contentWidth);
  const bodyFontSize = 7.2;
  const bodyLineHeight = 9;
  const rowMinHeight = 24;
  const pages = [];
  let page = createReportPage(context, false);

  const pushPage = () => {
    pages.push(page);
    page = createReportPage(context, true);
  };

  const ensureSpace = (height) => {
    if (page.cursorY - height < context.bottomMargin) {
      pushPage();
    }
  };

  ensureSpace(100);
  drawInfoPanel(page, context, metadata);

  const summaryRowCount = Math.ceil((summaryItems || []).length / 4);
  if (summaryRowCount) {
    ensureSpace(26 + summaryRowCount * 51);
    drawSummaryCards(page, context, summaryItems);
  }

  ensureSpace(54);
  addText(page.commands, 'Detailed Records', context.marginX, page.cursorY, {
    font: 'F2',
    size: 10,
    color: REPORT_COLORS.green
  });
  page.cursorY -= 12;

  const drawTableHeader = () => {
    const headerGroups = tableColumns.map((column) =>
      wrapText(column.label, Math.max(14, column.width - 10), 7.2, 2)
    );
    const headerHeight = getReportRowHeight(headerGroups, 24, 9);
    page.cursorY = drawReportTableRow(page.commands, tableColumns, headerGroups, context.marginX, page.cursorY, headerHeight, {
      font: 'F2',
      size: 7.2,
      lineHeight: 9,
      fill: REPORT_COLORS.green,
      stroke: REPORT_COLORS.green,
      textColor: REPORT_COLORS.white
    });
  };

  drawTableHeader();

  const dataRows = Array.isArray(rows) && rows.length ? rows : [{ label: emptyMessage }];
  dataRows.forEach((row, rowIndex) => {
    const sourceRow = Array.isArray(rows) && rows.length ? row : { ...row, __rowNumber: '' };
    const lineGroups = Array.isArray(rows) && rows.length
      ? getReportLineGroups(sourceRow, tableColumns, rowIndex, bodyFontSize, maxLinesPerCell)
      : tableColumns.map((column, columnIndex) =>
        wrapText(columnIndex === (includeRowNumbers ? 1 : 0) ? emptyMessage : '', Math.max(14, column.width - 10), bodyFontSize, 2)
      );
    const rowHeight = getReportRowHeight(lineGroups, rowMinHeight, bodyLineHeight);

    if (page.cursorY - rowHeight < context.bottomMargin) {
      pushPage();
      drawTableHeader();
    }

    page.cursorY = drawReportTableRow(page.commands, tableColumns, lineGroups, context.marginX, page.cursorY, rowHeight, {
      size: bodyFontSize,
      lineHeight: bodyLineHeight,
      fill: rowIndex % 2 === 0 ? REPORT_COLORS.white : REPORT_COLORS.stripe,
      stroke: REPORT_COLORS.grid,
      textColor: REPORT_COLORS.text
    });
  });

  page.cursorY -= 18;
  ensureSpace(112);
  drawCertificationSection(page, context);

  pages.push(page);
  pages.forEach((reportPage, index) => {
    addReportFooter(reportPage.commands, context, index + 1, pages.length);
  });

  return buildPdfFromStreams(
    pages.map((reportPage) => reportPage.commands.join('\n')),
    { pageWidth, pageHeight }
  );
};

module.exports = {
  buildBrandedTablePdf,
  buildBrandedReportPdf,
  normalizePdfText
};
