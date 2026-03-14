const fs = require('fs');
const html = fs.readFileSync('Design/loader.html', 'utf8');

// The HTML contains a <style> block and a <div class="wrap"> ... </div>
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const svgMatch = html.match(/<div class="stage">([\s\S]*?)<\/div>/);

let style = styleMatch ? styleMatch[1] : '';
let svgContent = svgMatch ? svgMatch[1] : '';

// Convert HTML properties to React properties
svgContent = svgContent.replace(/stroke-width/g, 'strokeWidth');
svgContent = svgContent.replace(/stroke-linecap/g, 'strokeLinecap');
svgContent = svgContent.replace(/class=/g, 'className=');

const componentCode = `
export function SvgLoader() {
  return (
    <div className="flex items-center justify-center mb-10">
      <style>{\`${style}\`}</style>
      <div className="relative w-[110px] h-[110px]">
        ${svgContent}
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/ui/svg-loader.tsx', componentCode);
