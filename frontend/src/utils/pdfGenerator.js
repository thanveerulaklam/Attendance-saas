import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function createPdf(options = {}) {
  const {
    orientation = 'p',
    unit = 'pt',
    format = 'a4',
    font = 'helvetica',
  } = options;
  const doc = new jsPDF(orientation, unit, format);
  doc.setFont(font);
  return doc;
}

export function addReportHeader(doc, {
  companyName,
  companyPhone,
  companyAddress,
  title,
  periodLabel,
  generatedAt,
  totalEmployees,
}) {
  let y = 32;
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(String(companyName || 'PunchPay'), doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  y += 14;
  if (companyAddress) {
    doc.text(String(companyAddress), doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
    y += 12;
  }
  if (companyPhone) {
    doc.text(String(companyPhone), doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });
    y += 12;
  }

  y += 6;
  doc.setLineWidth(0.5);
  doc.line(40, y, doc.internal.pageSize.getWidth() - 40, y);

  y += 18;
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(String(title || 'Attendance Report'), doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  y += 14;
  if (periodLabel) {
    doc.text(`Period: ${periodLabel}`, 40, y);
  }
  if (generatedAt) {
    doc.text(`Generated: ${generatedAt}`, doc.internal.pageSize.getWidth() - 40, y, { align: 'right' });
  }
  y += 12;
  if (totalEmployees != null) {
    doc.text(`Total employees: ${totalEmployees}`, 40, y);
    y += 10;
  }

  return y + 4;
}

export function addAutoTable(doc, head, body, options = {}) {
  autoTable(doc, {
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: 4,
    },
    headStyles: {
      fillColor: [15, 23, 42],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    ...options,
  });
}

export function savePdf(doc, filename) {
  const safeName = filename || 'PunchPay_Report.pdf';
  doc.save(safeName);
}

