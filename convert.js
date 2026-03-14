const fs = require('fs');
let code = fs.readFileSync('src/app/api/pipeline/run/route.ts', 'utf8');
code = code.split('\n').filter(line => !line.includes('temperature:')).join('\n');
fs.writeFileSync('src/app/api/pipeline/run/route.ts', code);
