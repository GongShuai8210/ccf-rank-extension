#!/usr/bin/env python3
"""Extract the CCF 2026 venue tables from the official seventh-edition PDF.

The source PDF uses custom Chinese fonts, so conventional text extraction can
garble its headings. The English table cells, however, retain reliable word
coordinates. This script reads those cells directly and assigns the documented
section metadata by page range. It deliberately validates row numbering and
the final row count so a changed PDF layout fails loudly instead of silently
shipping incomplete ranking data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pdfplumber


SOURCE_URL = (
    "https://www.ccf.org.cn/Academic_Evaluation/By_category/"
    "2026-03-05/861526.shtml"
)
SOURCE_VERSION = "2026-03"
SOURCE_EDITION = 7
EXPECTED_VENUE_COUNT = 681


@dataclass(frozen=True)
class Category:
    id: str
    zh: str
    en: str


CATEGORIES = (
    Category(
        "architecture",
        "计算机体系结构/并行与分布计算/存储系统",
        "Computer Architecture / Parallel and Distributed Computing / Storage",
    ),
    Category("networks", "计算机网络", "Computer Networks"),
    Category(
        "security",
        "网络与信息安全",
        "Network and Information Security",
    ),
    Category(
        "software",
        "软件工程/系统软件/程序设计语言",
        "Software Engineering / System Software / Programming Languages",
    ),
    Category(
        "data",
        "数据库/数据挖掘/内容检索",
        "Databases / Data Mining / Information Retrieval",
    ),
    Category("theory", "计算机科学理论", "Theoretical Computer Science"),
    Category(
        "graphics",
        "计算机图形学与多媒体",
        "Computer Graphics and Multimedia",
    ),
    Category("ai", "人工智能", "Artificial Intelligence"),
    Category(
        "hci",
        "人机交互与普适计算",
        "Human-Computer Interaction and Ubiquitous Computing",
    ),
    Category(
        "interdisciplinary",
        "交叉/综合/新兴",
        "Interdisciplinary / General / Emerging",
    ),
)


# 1-indexed inclusive page ranges from the official 72-page PDF. A range is
# (first_page, last_page, category_index, venue_type, rank).
SECTIONS = (
    (2, 2, 0, "journal", "A"),
    (3, 3, 0, "journal", "B"),
    (4, 4, 0, "journal", "C"),
    (5, 5, 0, "conference", "A"),
    (6, 7, 0, "conference", "B"),
    (8, 9, 0, "conference", "C"),
    (10, 10, 1, "journal", "A"),
    (11, 11, 1, "journal", "B"),
    (12, 12, 1, "journal", "C"),
    (13, 13, 1, "conference", "A"),
    (14, 14, 1, "conference", "B"),
    (15, 16, 1, "conference", "C"),
    (17, 17, 2, "journal", "A"),
    (18, 18, 2, "journal", "B"),
    (19, 19, 2, "journal", "C"),
    (20, 20, 2, "conference", "A"),
    (21, 21, 2, "conference", "B"),
    (22, 23, 2, "conference", "C"),
    (24, 24, 3, "journal", "A"),
    (25, 25, 3, "journal", "B"),
    (26, 26, 3, "journal", "C"),
    (27, 27, 3, "conference", "A"),
    (28, 29, 3, "conference", "B"),
    (30, 31, 3, "conference", "C"),
    (32, 32, 4, "journal", "A"),
    (33, 33, 4, "journal", "B"),
    (34, 34, 4, "journal", "C"),
    (35, 35, 4, "conference", "A"),
    (36, 36, 4, "conference", "B"),
    (37, 37, 4, "conference", "C"),
    (38, 38, 5, "journal", "A"),
    (39, 39, 5, "journal", "B"),
    (40, 40, 5, "journal", "C"),
    (41, 41, 5, "conference", "A"),
    (42, 42, 5, "conference", "B"),
    (43, 43, 5, "conference", "C"),
    (44, 44, 6, "journal", "A"),
    (45, 45, 6, "journal", "B"),
    (46, 46, 6, "journal", "C"),
    (47, 47, 6, "conference", "A"),
    (48, 48, 6, "conference", "B"),
    (49, 50, 6, "conference", "C"),
    (51, 51, 7, "journal", "A"),
    (52, 53, 7, "journal", "B"),
    (54, 56, 7, "journal", "C"),
    (57, 57, 7, "conference", "A"),
    (58, 58, 7, "conference", "B"),
    (59, 60, 7, "conference", "C"),
    (61, 61, 8, "journal", "A"),
    (62, 62, 8, "journal", "B"),
    (63, 63, 8, "journal", "C"),
    (64, 64, 8, "conference", "A"),
    (65, 65, 8, "conference", "B"),
    (66, 66, 8, "conference", "C"),
    (67, 67, 9, "journal", "A"),
    (68, 68, 9, "journal", "B"),
    (69, 69, 9, "journal", "C"),
    (70, 70, 9, "conference", "A"),
    (71, 71, 9, "conference", "B"),
    (72, 72, 9, "conference", "C"),
)


# Cell extraction is faithful for nearly all abbreviations. These are line-wrap
# or typography cases where the printed text should be normalized for lookup.
ABBR_NORMALIZATIONS = {
    "SIG- METRICS": "SIGMETRICS",
    "SIG-METRICS": "SIGMETRICS",
    "INTER- SPEECH": "INTERSPEECH",
    "INTER-SPEECH": "INTERSPEECH",
    "CODES+ ISSS": "CODES+ISSS",
    "CCFTPCI": "CCF TPCI",
    "ACMDLT": "ACM DLT",
    "JCOMPLEXI TY": "JCOMPLEXITY",
}


# Corrections below are narrowly scoped to source page/row and document why a
# canonical lookup string differs from raw coordinate extraction. Aliases also
# preserve former names explicitly printed in the PDF.
RECORD_OVERRIDES: dict[tuple[int, int], dict] = {
    (5, 9): {"aliases": ["USENIX ATC"]},
    (7, 25): {
        "name": "European Conference on Parallel and Distributed Computing"
    },
    (9, 28): {"aliases": ["Hot Topics in Storage and File Systems"]},
    (9, 30): {"name": "International Conference on Joint Cloud Computing"},
    (10, 3): {"aliases": ["IEEE/ACM Transactions on Networking"]},
    (28, 8): {
        "name": (
            "ACM/IEEE International Conference on Model Driven Engineering "
            "Languages and Systems"
        )
    },
    (34, 4): {"aliases": ["IR", "Information Retrieval Journal"]},
    (43, 6): {"aliases": ["RTA"]},
    (47, 3): {"aliases": ["IEEE Virtual Reality"]},
    (48, 12): {
        "name": "Pacific Conference on Computer Graphics and Applications"
    },
    (49, 2): {
        "aliases": [
            "CASA",
            "International Conference on Computer Animation and Social Agents",
        ]
    },
    (52, 8): {
        "aliases": [
            "IEEE/ACM Transactions on Audio, Speech and Language Processing"
        ]
    },
    (69, 12): {
        "aliases": [
            "FITEE",
            "Frontiers of Information Technology & Electronic Engineering",
        ]
    },
    (70, 1): {"aliases": ["International World Wide Web Conference"]},
}


def section_for_page(page_number: int) -> tuple[Category, str, str]:
    for first, last, category_index, venue_type, rank in SECTIONS:
        if first <= page_number <= last:
            return CATEGORIES[category_index], venue_type, rank
    raise ValueError(f"No section mapping for PDF page {page_number}")


def grouped_words(page, bbox: tuple[float, float, float, float]) -> list[list[str]]:
    """Return a cell's words grouped into visual lines."""

    # Glyph boxes occasionally extend a fraction of a point across a table
    # rule. Insetting prevents the final line of the preceding row from being
    # captured in the next row without touching the cell's real text margin.
    x0, top, x1, bottom = bbox
    inset_bbox = (x0 + 0.75, top + 1.25, x1 - 0.75, bottom - 1.25)
    words = page.crop(inset_bbox).extract_words(
        x_tolerance=1,
        y_tolerance=2,
        keep_blank_chars=False,
        use_text_flow=False,
    )
    if not words:
        return []

    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        for line in lines:
            if abs(line[0]["top"] - word["top"]) <= 2:
                line.append(word)
                break
        else:
            lines.append([word])

    return [
        [item["text"].strip() for item in sorted(line, key=lambda item: item["x0"])]
        for line in sorted(lines, key=lambda line: line[0]["top"])
    ]


def join_cell_words(lines: Iterable[Iterable[str]]) -> str:
    tokens = [token for line in lines for token in line if token]
    text = " ".join(tokens)
    text = re.sub(r"-\s+", "-", text)
    text = re.sub(r"\s+([,.:;)])", r"\1", text)
    text = re.sub(r"([(])\s+", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def clean_english_cell(text: str) -> str:
    """Remove PDF font-garbling after the English part of a mixed cell."""

    match = re.search(r"[^\x00-\x7F]", text)
    if match:
        text = text[: match.start()]
    text = text.replace("�", "")
    return re.sub(r"\s+", " ", text).strip(" /\t")


def clean_url(lines: Iterable[Iterable[str]]) -> str:
    url = "".join(token for line in lines for token in line if token)
    url = re.sub(r"[^\x21-\x7E]", "", url)
    url = url.replace("http://dblp.", "https://dblp.")
    return url.rstrip()


def slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "unnamed"


def extract_rows(pdf_path: Path) -> list[dict]:
    venues: list[dict] = []
    sequence_numbers: dict[tuple[str, str, str], list[int]] = {}

    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) != 72:
            raise ValueError(f"Expected 72 pages, found {len(pdf.pages)}")

        for page_number, page in enumerate(pdf.pages, start=1):
            if page_number == 1:
                continue
            category, venue_type, rank = section_for_page(page_number)
            section_key = (category.id, venue_type, rank)

            for table in page.find_tables():
                for table_row in table.rows:
                    if len(table_row.cells) != 5 or any(
                        cell is None for cell in table_row.cells
                    ):
                        continue
                    cell_lines = [
                        grouped_words(page, cell) for cell in table_row.cells
                    ]
                    sequence_text = join_cell_words(cell_lines[0])
                    if not re.fullmatch(r"\d+", sequence_text):
                        continue

                    sequence = int(sequence_text)
                    abbreviation = clean_english_cell(join_cell_words(cell_lines[1]))
                    abbreviation = ABBR_NORMALIZATIONS.get(abbreviation, abbreviation)
                    name = clean_english_cell(join_cell_words(cell_lines[2]))
                    publisher = clean_english_cell(join_cell_words(cell_lines[3]))
                    url = clean_url(cell_lines[4])

                    if not name:
                        raise ValueError(
                            f"Missing venue name on PDF page {page_number}, row {sequence}"
                        )

                    record = {
                        "type": venue_type,
                        "rank": rank,
                        "category": category.id,
                        "abbr": abbreviation,
                        "name": name,
                        "aliases": [],
                        "publisher": publisher,
                        "url": url,
                        "sourcePage": page_number,
                        "sourceRow": sequence,
                    }
                    record.update(RECORD_OVERRIDES.get((page_number, sequence), {}))
                    identity = record["abbr"] or record["name"]
                    venue_id = f"{venue_type}-{category.id}-{slug(identity)}"
                    venues.append({"id": venue_id, **record})
                    sequence_numbers.setdefault(section_key, []).append(sequence)

    for key, numbers in sequence_numbers.items():
        expected = list(range(1, max(numbers) + 1))
        if numbers != expected:
            raise ValueError(
                f"Unexpected row sequence for {key}: got {numbers}, expected {expected}"
            )

    if len(venues) != EXPECTED_VENUE_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_VENUE_COUNT} venues, extracted {len(venues)}"
        )
    ids = [venue["id"] for venue in venues]
    duplicates = sorted({venue_id for venue_id in ids if ids.count(venue_id) > 1})
    if duplicates:
        raise ValueError(f"Duplicate venue IDs: {duplicates}")

    return venues


def build_document(pdf_path: Path) -> dict:
    digest = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    return {
        "schemaVersion": 1,
        "source": {
            "title": "中国计算机学会推荐国际学术会议和期刊目录（第七版）",
            "edition": SOURCE_EDITION,
            "version": SOURCE_VERSION,
            "url": SOURCE_URL,
            "file": pdf_path.name,
            "sha256": digest,
        },
        "categories": [category.__dict__ for category in CATEGORIES],
        "venues": extract_rows(pdf_path),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Path to the official CCF PDF")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        help="Write deterministic UTF-8 JSON to this path; omit to validate only",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.pdf.is_file():
        raise FileNotFoundError(args.pdf)

    document = build_document(args.pdf)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    summary = {
        "source": document["source"]["version"],
        "venues": len(document["venues"]),
        "journals": sum(v["type"] == "journal" for v in document["venues"]),
        "conferences": sum(
            v["type"] == "conference" for v in document["venues"]
        ),
        "output": str(args.output) if args.output else None,
    }
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # Keep CI failures concise and actionable.
        print(f"error: {error}", file=sys.stderr)
        raise
