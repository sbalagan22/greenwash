const fs = require('fs');
const crypto = require('crypto');

async function testUpload() {
    try {
        const largeBuffer = crypto.randomBytes(15 * 1024 * 1024);
        fs.writeFileSync('large-test.pdf', largeBuffer);
        
        const fileBuffer = fs.readFileSync('large-test.pdf');
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        
        const formData = new FormData();
        formData.append('file', blob, 'large-test.pdf');

        const res = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
        });

        const text = await res.text();
        console.log("Body:", text);
    } catch (err) {
        console.error(err);
    }
}

testUpload();
