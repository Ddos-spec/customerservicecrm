const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');

const SUPPORTED_MIME_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function detectFileType(mimetype, filename) {
    if (SUPPORTED_MIME_TYPES[mimetype]) return SUPPORTED_MIME_TYPES[mimetype];
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'xlsx') return 'xlsx';
    return null;
}

async function parsePdf(buffer) {
    const parser = new PDFParse({ data: buffer });
    try {
        const result = await parser.getText();
        return result.text || '';
    } finally {
        await parser.destroy();
    }
}

async function parseDocx(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
}

async function parseXlsx(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const lines = [];
    workbook.eachSheet((worksheet) => {
        worksheet.eachRow((row) => {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            const rowText = values
                .map((v) => {
                    if (v === null || v === undefined) return '';
                    if (typeof v === 'object') return (v.text || v.result || '').toString();
                    return v.toString();
                })
                .filter(Boolean)
                .join(' | ');
            if (rowText.trim()) lines.push(rowText.trim());
        });
    });
    return lines.join('\n');
}

async function parseFileBuffer({ buffer, mimetype, filename }) {
    const type = detectFileType(mimetype, filename);
    if (!type) {
        throw new Error(`Tipe file tidak didukung: ${mimetype || filename}`);
    }
    if (type === 'pdf') return parsePdf(buffer);
    if (type === 'docx') return parseDocx(buffer);
    return parseXlsx(buffer);
}

module.exports = { parseFileBuffer, detectFileType, SUPPORTED_MIME_TYPES };
