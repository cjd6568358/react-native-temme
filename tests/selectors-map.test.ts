import fs from "fs";
import path from "path";
import temme from "../src/temme";
import selectors, { selectorsMap } from "./fixtures/selectors";

const fixturesDir = path.resolve(__dirname, "fixtures");

/** 预处理 HTML：移除 script/style/comment 块，减少 parse5 tokenizer 工作量。
 *  这些内容不影响 temme 选择器的匹配结果。 */
export function htmlShaking(html: string): string {
  return (
    html
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      // .replace(/>\s+</g, "><")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
  );
}

function loadHtml(file: string): string {
  const fileName = file.endsWith(".html") ? file : file + ".html";
  return fs.readFileSync(path.join(fixturesDir, fileName), "utf-8");
}

describe("selectorsMap 匹配测试", () => {
  for (const [name, htmlFiles] of Object.entries(selectorsMap)) {
    describe(name, () => {
      for (const htmlFile of htmlFiles) {
        test(`${htmlFile}耗时对比`, () => {
          const html = loadHtml(htmlFile);
          const selector = selectors[name];

          // 不经过预处理
          const startRaw = performance.now();
          const resultRaw = temme(html, selector);
          const timeRaw = performance.now() - startRaw;

          // 经过预处理
          const startStripped = performance.now();
          const stripped = htmlShaking(html);
          const resultStripped = temme(stripped, selector);
          const timeStripped = performance.now() - startStripped;

          console.log(
            `[${name}/${htmlFile}] raw: ${timeRaw.toFixed(2)}ms, stripped: ${timeStripped.toFixed(2)}ms, ` +
              `节省: ${(timeRaw - timeStripped).toFixed(2)}ms (${((1 - timeStripped / timeRaw) * 100).toFixed(1)}%)`,
          );

          // 校验结果一致性
          expect(JSON.parse(JSON.stringify(resultStripped))).toEqual(
            JSON.parse(JSON.stringify(resultRaw)),
          );
        });
      }
    });
  }
});
