// Original synthetic, reproducible PDF bytes; no third-party content or fonts.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const [name, pressure] of [
  ["baseline", 8],
  ["revised", 10],
]) {
  const stream = `BT /F1 16 Tf 72 720 Td (Owned SDK example) Tj 0 -32 Td /F1 12 Tf (Maximum operating pressure: ${pressure} bar.) Tj 0 -24 Td (Synthetic comparison fixture. Not engineering guidance.) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  writeFileSync(fileURLToPath(new URL(`../examples/fixtures/${name}.pdf`, import.meta.url)), pdf);
}
