import assert from "node:assert/strict";
import test from "node:test";
import { catalogCsv } from "../src/lib/catalog-csv.ts";

const header = '\uFEFF"Title","Authors","ISBN","Formats"\r\n';

test("catalog CSV keeps UTF-8 text, field boundaries and list order", () => {
  assert.equal(
    catalogCsv([
      {
        title: '中文, "书名"\n下卷',
        authors: ["张三", "李四"],
        isbn: "0306406152",
        formats: ["EPUB", "PDF"],
      },
      { title: "A title", authors: [], formats: ["PDF"] },
    ]),
    header +
      '"中文, ""书名""\n下卷","张三, 李四","0306406152","EPUB, PDF"\r\n' +
      '"A title","","","PDF"\r\n',
  );
  assert.equal(catalogCsv([]), header);
});

test("formula-like cells are escaped without normalizing the metadata", () => {
  const titles = ["=1+1", "+17", "-42", "@Survey", " \ttitle", " \u200B＝1+1"];
  for (const title of titles)
    assert.equal(
      catalogCsv([{ title, authors: ["@Author"], formats: ["PDF"] }]),
      `${header}"'${title}","'@Author","","PDF"\r\n`,
    );
});
