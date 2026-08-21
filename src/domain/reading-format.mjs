function chapterHeading(line) {
  const text = String(line || "").trim();
  if (!text) return null;
  // Only an explicit Chinese chapter marker is structural. Markdown titles,
  // bare numbers and list numbering remain正文，避免误拆读物。
  if (/^第\s*[^章\r\n]{1,24}\s*章(?:\s+.{1,100}|[:：]\s*.{1,100})?$/u.test(text)) return text;
  return null;
}

export function normalizeProseParagraphs(rawText) {
  function joinWrappedLines(lines) {
    let result = "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!result) {
        result = line;
        continue;
      }
      const previous = result.at(-1) || "";
      const next = line.at(0) || "";
      const joinWithoutSpace = /[\u3400-\u9fff，。！？；：、）》】”’]/u.test(previous)
        && /[\u3400-\u9fff（《【“‘]/u.test(next);
      result += `${joinWithoutSpace ? "" : " "}${line}`;
    }
    return result;
  }

  return String(rawText || "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u0000/gu, "")
    .split(/\n\s*\n/gu)
    .map((block) => joinWrappedLines(block.split("\n"))
      .replace(/\s+([，。！？；：、])/gu, "$1")
      .replace(/([“‘（《])\s+/gu, "$1")
      .trim())
    .filter(Boolean);
}

export function parseBookChapters(rawText) {
  const clean = String(rawText || "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u0000/gu, "")
    .trim();
  if (!clean) return [];
  const chapters = [];
  let current = null;
  let preface = [];
  for (const line of clean.split("\n")) {
    const heading = chapterHeading(line);
    if (heading) {
      if (current) {
        current.body = normalizeProseParagraphs(current.lines.join("\n")).join("\n\n");
        chapters.push(current);
      } else if (preface.join("").trim()) {
        chapters.push({ title: "序章", body: normalizeProseParagraphs(preface.join("\n")).join("\n\n"), warning: "标题前文字已作为序章保存。" });
      }
      current = { title: heading, lines: [], warning: "" };
      preface = [];
    } else if (current) {
      current.lines.push(line);
    } else {
      preface.push(line);
    }
  }
  if (current) {
    current.body = normalizeProseParagraphs(current.lines.join("\n")).join("\n\n");
    chapters.push(current);
  } else if (preface.join("").trim()) {
    chapters.push({ title: "正文", body: normalizeProseParagraphs(preface.join("\n")).join("\n\n"), warning: "未识别到章节标题，已作为单章保存。" });
  }
  return chapters
    .map((chapter) => ({
      title: chapter.title.trim().slice(0, 160),
      body: chapter.body.trim(),
      warning: chapter.warning || (chapter.body.trim() ? "" : "空章节"),
    }))
    .filter((chapter) => chapter.body || chapter.title);
}

function splitLongPiece(text, limit) {
  const pieces = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = -1;
    const window = rest.slice(0, limit + 1);
    const punctuation = Math.max(
      window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"),
      window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "),
      window.lastIndexOf("; "), window.lastIndexOf("；"),
    );
    if (punctuation > limit * 0.55) cut = punctuation + 1;
    if (cut < 0) {
      const space = window.lastIndexOf(" ");
      cut = space > limit * 0.55 ? space : limit;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export function paginateChapter(body, target) {
  const paragraphs = normalizeProseParagraphs(body).flatMap((item) => splitLongPiece(item, target));
  if (!paragraphs.length) return [""];
  const pages = [];
  let current = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const nextLength = length + paragraph.length + (current.length ? 2 : 0);
    if (current.length && nextLength > target && length >= target * 0.58) {
      pages.push(current.join("\n\n"));
      current = [paragraph];
      length = paragraph.length;
    } else {
      current.push(paragraph);
      length = nextLength;
    }
  }
  if (current.length) {
    const last = current.join("\n\n");
    if (pages.length && last.length < target * 0.18) pages[pages.length - 1] += `\n\n${last}`;
    else pages.push(last);
  }
  return pages;
}

export function paginateChapterForScreen(body, { charactersPerLine, linesPerPage }) {
  const perLine = Math.max(8, Math.floor(Number(charactersPerLine) || 16));
  const pageLines = Math.max(6, Math.floor(Number(linesPerPage) || 12));
  const paragraphs = normalizeProseParagraphs(body);
  if (!paragraphs.length) return [""];

  const pages = [];
  let current = [];
  let usedLines = 0;
  for (const paragraph of paragraphs) {
    let rest = paragraph;
    while (rest) {
      const availableLines = pageLines - usedLines - .15;
      if (current.length && availableLines < 1.1) {
        pages.push(current.join("\n\n"));
        current = [];
        usedLines = 0;
        continue;
      }
      const availableCharacters = Math.max(perLine, Math.floor(availableLines * perLine) - 2);
      let piece = rest;
      if (rest.length > availableCharacters) {
        const window = rest.slice(0, availableCharacters + 1);
        const punctuation = Math.max(
          window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"),
          window.lastIndexOf("；"), window.lastIndexOf("，"), window.lastIndexOf("、"),
          window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "),
        );
        const space = window.lastIndexOf(" ");
        const cut = punctuation > availableCharacters * .7
          ? punctuation + 1
          : space > availableCharacters * .7 ? space : availableCharacters;
        piece = rest.slice(0, cut).trim();
        rest = rest.slice(cut).trim();
      } else {
        rest = "";
      }
      current.push(piece);
      usedLines += Math.max(1, Math.ceil((piece.length + 2) / perLine)) + .15;
      if (rest) {
        pages.push(current.join("\n\n"));
        current = [];
        usedLines = 0;
      }
    }
  }
  if (current.length) pages.push(current.join("\n\n"));
  return pages;
}
