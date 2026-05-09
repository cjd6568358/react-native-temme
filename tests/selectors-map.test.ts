import fs from "fs";
import path from "path";
import temme from "../src/temme";
import selectors, { selectorsMap } from "./fixtures/selectors";

const fixturesDir = path.resolve(__dirname, "fixtures");

function loadHtml(file: string): string {
  const fileName = file.endsWith(".html") ? file : file + ".html";
  return fs.readFileSync(path.join(fixturesDir, fileName), "utf-8");
}

describe("selectorsMap 匹配测试", () => {
  for (const [name, htmlFiles] of Object.entries(selectorsMap)) {
    describe(name, () => {
      for (const htmlFile of htmlFiles) {
        test(`${htmlFile}`, () => {
          const html = loadHtml(htmlFile);
          const selector = selectors[name];
          const result = temme(html, selector);
          expect(JSON.parse(JSON.stringify(result))).toMatchSnapshot();
        });
      }
    });
  }
});
