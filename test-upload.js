const fs = require('fs');

async function testUpload() {
    try {
        const fileBuffer = fs.readFileSync('test_report.pdf');
        
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', blob, 'test_report.pdf');

        console.log("Sending request...");
        const res = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Body:", text);
    } catch (err) {
        console.error(err);
    }
}

testUpload();
