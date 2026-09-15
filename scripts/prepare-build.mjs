import { readFileSync, writeFileSync } from "node:fs";

const path = "app/page.tsx";
let source = readFileSync(path, "utf8");

source = source.replace(
  "await html2pdf(reportRef.current).set({",
  "await html2pdf().set({",
);
source = source.replace(
  "    }).save();",
  "    }).from(reportRef.current).save();",
);

writeFileSync(path, source);
console.log("Prepared html2pdf Worker API usage for Next.js type checking.");
