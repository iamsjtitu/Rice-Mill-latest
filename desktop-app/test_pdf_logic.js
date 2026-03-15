const fs = require('fs');
const PDFDocument = require('pdfkit');
const { getDailyReportData, generateDailyReportPdf } = require('./routes/daily_report_logic');

// Mock database
const database = {
  data: {
    entries: [
      { date: '2025-12-25', truck_no: 'UP32AB1234', bags: 100, final_w: 5000, mill_w: 5000 }
    ],
    private_paddy: [],
    rice_sales: [],
    milling_entries: [
      { date: '2025-12-25', paddy_input_qntl: 50, rice_qntl: 30, rice_type: 'raw' }
    ],
    dc_deliveries: [],
    cash_transactions: [
       { date: '2025-12-25', account: 'cash', txn_type: 'jama', amount: 10000, description: 'Test Jama' }
    ],
    msp_payments: [],
    private_payments: [],
    byproduct_sales: [],
    frk_purchases: [],
    mill_parts_stock: [],
    staff_attendance: [],
    staff: [],
    diesel_accounts: [],
    sale_vouchers: [],
    purchase_vouchers: []
  }
};

const query = { date: '2025-12-25', mode: 'detail' };

try {
  console.log('Fetching report data...');
  const data = getDailyReportData(database, query);
  console.log('Data fetched:', JSON.stringify(data.paddy_entries.count));

  console.log('Generating PDF...');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 25 });
  const stream = fs.createWriteStream('test_output.pdf');
  doc.pipe(stream);

  generateDailyReportPdf(doc, data, query);
  doc.end();

  stream.on('finish', () => {
    console.log('PDF generated successfully: test_output.pdf');
  });

} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
