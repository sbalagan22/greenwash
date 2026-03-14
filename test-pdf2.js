const { PDFParse } = require("pdf-parse");
const fs = require("fs");
const pdfBuffer = fs.readFileSync("test_report.pdf");

async function test() {
    try {
        const parser = new PDFParse({ data: pdfBuffer });
        const result = await parser.getText();
        console.log("SUCCESS:", result.text.substring(0, 100));
    } catch (err) {
        console.error("error:", err);
    }
}
test();
