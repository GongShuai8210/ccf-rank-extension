# Data maintenance notes

## Source of truth

The source of truth is the 72-page PDF “中国计算机学会推荐国际学术会议和期刊目录（第七版）” in the repository root. The generated dataset records its filename and SHA-256.

The seventh edition contains 681 table rows: 295 journals and 386 conferences. The conference total is one larger than some community-maintained 2026 datasets because page 23 is a continuation page and contains row 24, HotSec. A parser that always drops the first table row as a header will lose a real venue on continuation pages.

## Extraction method

`scripts/extract_ccf_pdf.py` uses `pdfplumber` table geometry and word coordinates. This avoids relying on the PDF's custom Chinese font encoding. It:

1. maps each 1-indexed PDF page to category, venue type, and rank;
2. finds five-column tables and accepts rows whose first cell is numeric;
3. reads each cell with a small inset so glyphs crossing a border do not leak into the next row;
4. normalizes wrapped abbreviations and a small number of source-specific typography artifacts;
5. keeps former names printed in the document as search aliases;
6. validates continuous numbering within every category/type/rank section;
7. requires exactly 681 unique venue records;
8. records the PDF SHA-256.

`RECORD_OVERRIDES` is intentionally keyed by PDF page and row. Each override should fix only an auditable line-wrap artifact or preserve an explicitly printed former name.

## Rebuild checklist

```bash
python -m pip install -r requirements-dev.txt
python scripts/extract_ccf_pdf.py "path/to/official.pdf" --output data/ccf-2026.json
npm run check
```

For a future edition, first review the rendered PDF and update `CATEGORIES`, `SECTIONS`, expected totals, source metadata, and narrowly scoped overrides. Do not weaken sequence, uniqueness, or count checks merely to make a new file pass.
