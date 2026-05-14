import fs from "fs";
import path from "path";
import temme from "../src/temme";
import selectors, { selectorsMap } from "./fixtures/selectors";

const fixturesDir = path.resolve(__dirname, "fixtures");

function loadHtml(file: string): string {
  const fileName = file.endsWith(".html") ? file : file + ".html";
  return fs.readFileSync(path.join(fixturesDir, fileName), "utf-8");
}

// lexbor customLoader
let lexborLoad: ((html: string) => any) | null = null;
try {
  lexborLoad = require("../native/lexbor-native").load;
} catch (e) {
  console.warn("lexbor-native not available, skipping lexbor tests");
}

describe("selectorsMap 快照对比", () => {
  for (const [name, htmlFiles] of Object.entries(selectorsMap)) {
    describe(name, () => {
      for (const htmlFile of htmlFiles) {
        test(`${htmlFile}`, () => {
          const html = loadHtml(htmlFile);
          const selector = selectors[name];

          // cheerio
          const startCheerio = performance.now();
          const cheerioResult = temme(html, selector);
          const timeCheerio = performance.now() - startCheerio;

          expect(JSON.stringify(cheerioResult, null, 2)).toMatchSnapshot(`${name}/${htmlFile} cheerio`);

          // lexbor
          if (lexborLoad) {
            const lexborLoader = (h: string) => lexborLoad!(h);
            const startLexbor = performance.now();
            const lexborResult = temme(html, selector, {}, {}, {}, lexborLoader);
            const timeLexbor = performance.now() - startLexbor;

            console.log(
              `[${name}/${htmlFile}] cheerio: ${timeCheerio.toFixed(2)}ms, lexbor: ${timeLexbor.toFixed(2)}ms, ` +
                `speedup: ${(timeCheerio / timeLexbor).toFixed(2)}x`,
            );

            expect(JSON.stringify(lexborResult, null, 2)).toMatchSnapshot(`${name}/${htmlFile} lexbor`);
          }
        });
      }
    });
  }
});
