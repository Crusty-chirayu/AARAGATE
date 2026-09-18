"""Generate/verify a synthetic PDF fixture using installed PyMuPDF and pypdf.

Run with --verify-only to check the saved PDF without changing it.
This fixture is not official GATE material or production question data.
"""
import argparse
import io
from pathlib import Path

import fitz
from pypdf import PdfReader


OUTPUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "aaragate-ingestion-fixture.pdf"
TITLE = "AARAGATE test document"
NOTICE = "Synthetic ingestion fixture - original sample questions, NOT official GATE questions."
PAGES = [
    [
        "GATE CSE-style sample questions - Set 1",
        "",
        "Question 1 | Type: MCQ | Marks: 1",
        "Subject: Data Structures",
        "Topic: Stack operations",
        "An initially empty stack performs PUSH(10), PUSH(20), POP(), PUSH(30).",
        "What value is returned by the next POP() operation?",
        "A. 10",
        "B. 30",
        "C. 20",
        "D. The stack is empty",
        "",
        "Question 2 | Type: MCQ | Marks: 1",
        "Subject: Algorithms",
        "Topic: Binary search complexity",
        "For a sorted array of n distinct elements, what is the worst-case",
        "time complexity of standard binary search?",
        "A. O(1)",
        "B. O(n)",
        "C. O(log n)",
        "D. O(n log n)",
    ],
    [
        "GATE CSE-style sample questions - Set 2",
        "",
        "Question 3 | Type: MCQ | Marks: 1",
        "Subject: Operating Systems",
        "Topic: CPU scheduling",
        "Two processes arrive at time 0. P1 has a CPU burst of 3 time units;",
        "P2 has a CPU burst of 5 time units. Non-preemptive FCFS runs P1 first.",
        "Assume no context-switch overhead. What is their average waiting time?",
        "A. 0 time units",
        "B. 1.5 time units",
        "C. 3 time units",
        "D. 4 time units",
        "",
        "Question 4 | Type: MCQ | Marks: 1",
        "Subject: Computer Networks",
        "Topic: IPv4 subnetting",
        "How many total IPv4 addresses are in a /29 subnet, including the",
        "network and broadcast addresses?",
        "A. 2",
        "B. 6",
        "C. 8",
        "D. 16",
    ],
    [
        "Answer key - synthetic fixture only",
        "",
        "Question 1: B - 30",
        "After the first POP(), the stack contains 10. PUSH(30) puts 30 on top.",
        "",
        "Question 2: C - O(log n)",
        "Each binary-search step halves the remaining search interval.",
        "",
        "Question 3: B - 1.5 time units",
        "P1 waits 0 time units and P2 waits 3. Average = (0 + 3) / 2 = 1.5.",
        "",
        "Question 4: C - 8",
        "There are 32 - 29 = 3 host bits. Total addresses = 2^3 = 8.",
        "",
        "This key belongs only to these original test questions.",
        "No official answer status or examination prediction is implied.",
    ],
]


def verify(data: bytes) -> None:
    reader = PdfReader(io.BytesIO(data), strict=True)
    assert not reader.is_encrypted, "Fixture must not be encrypted"
    assert len(reader.pages) == 3, "Expected three physical pages"
    with fitz.open(stream=data, filetype="pdf") as document:
        assert document.page_count == 3
        for index, lines in enumerate(PAGES):
            for parser, text in (
                ("pypdf", reader.pages[index].extract_text()),
                ("PyMuPDF", document[index].get_text()),
            ):
                assert text, f"{parser}: empty page {index + 1}"
                for expected in [TITLE, NOTICE, *lines, f"Page {index + 1} of 3"]:
                    assert expected in text, f"{parser}: page {index + 1} missing {expected!r}"
            assert not document[index].get_images(), "Expected text, not raster images"
    assert "Answer key" not in reader.pages[0].extract_text()
    assert "Answer key" not in reader.pages[1].extract_text()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if not args.verify_only:
        if OUTPUT.exists():
            raise FileExistsError(f"Refusing to overwrite {OUTPUT}; use --verify-only")
        with fitz.open() as document:
            document.set_metadata({"title": TITLE, "subject": "Synthetic, non-sensitive ingestion acceptance fixture"})
            for index, lines in enumerate(PAGES):
                page = document.new_page(width=595, height=842)
                page.insert_text((42, 48), TITLE, fontsize=18, fontname="helv")
                page.insert_text((42, 70), NOTICE, fontsize=8, fontname="helv")
                remaining = page.insert_textbox(fitz.Rect(42, 100, 553, 760), "\n".join(lines), fontsize=11, fontname="helv")
                assert remaining >= 0, f"Text overflow on page {index + 1}"
                page.insert_text((42, 800), f"Page {index + 1} of 3", fontsize=9, fontname="helv")
            data = document.tobytes(garbage=4, deflate=True)
        verify(data)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT.open("xb") as output:
            output.write(data)
    verify(OUTPUT.read_bytes())
    print(f"Path: {OUTPUT}")
    print(f"Size: {OUTPUT.stat().st_size} bytes")
    print("Pages: 3")
    print("PASS: real PyMuPDF and pypdf parsers extracted every expected line on all pages.")
    print("PASS: separate answer key, no encryption, no raster images.")


if __name__ == "__main__":
    main()
