const pdfParse = require("pdf-parse");
const fs = require("fs");
const pdfBuffer = fs.readFileSync("test_report.pdf");

async function test() {
  console.log("pdfParse type:", typeof pdfParse);
  console.log("Keys:", Object.keys(pdfParse));

  if (typeof pdfParse === "function") {
    console.log("Calling as function...");
    const res = await pdfParse(pdfBuffer);
    console.log(res.text.substring(0, 50));
  } else if (pdfParse.default && typeof pdfParse.default === "function") {
    console.log("Calling default...");
    const res = await pdfParse.default(pdfBuffer);
    console.log(res.text.substring(0, 50));
  } else {
    console.log("Cannot find function!");
  }
}
test().catch(console.error);
