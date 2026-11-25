#!/usr/bin/env python3
"""
Extracts PDF/image files from a .zip archive or splits large multi-page PDFs
into <= 8-page PDF chunks so Gemini Vision OCR never truncates output on 35+ page scans.
Prints JSON to stdout: { "success": true, "items": [ { "name": ..., "mime": ..., "b64": ..., "pageStart": 1, "pageEnd": 8 } ] }
"""
import base64
import io
import json
import os
import sys
import zipfile


def split_pdf_bytes(raw: bytes, filename: str, chunk_size: int = 8):
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(raw))
        total = len(reader.pages)
        if total <= chunk_size:
            return [{
                "name": filename,
                "mime": "application/pdf",
                "b64": base64.b64encode(raw).decode("ascii"),
                "pageStart": 1,
                "pageEnd": total,
            }]
        chunks = []
        for start in range(0, total, chunk_size):
            end = min(total, start + chunk_size)
            writer = PdfWriter()
            for p in range(start, end):
                writer.add_page(reader.pages[p])
            buf = io.BytesIO()
            writer.write(buf)
            chunks.append({
                "name": f"{filename} (s.{start+1}-{end})",
                "mime": "application/pdf",
                "b64": base64.b64encode(buf.getvalue()).decode("ascii"),
                "pageStart": start + 1,
                "pageEnd": end,
            })
        return chunks
    except Exception:
        return [{
            "name": filename,
            "mime": "application/pdf",
            "b64": base64.b64encode(raw).decode("ascii"),
            "pageStart": 1,
            "pageEnd": 0,
        }]


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "Missing file path"}))
        return
    path = sys.argv[1]
    orig_name = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(path)
    ext = os.path.splitext(orig_name.lower())[1]
    items = []

    try:
        if ext == ".zip":
            with zipfile.ZipFile(path, "r") as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    bn = os.path.basename(info.filename)
                    if not bn or bn.startswith(".") or "__MACOSX" in info.filename:
                        continue
                    fext = os.path.splitext(bn.lower())[1]
                    raw = z.read(info.filename)
                    if fext == ".pdf":
                        items.extend(split_pdf_bytes(raw, bn, 8))
                    elif fext in (".jpg", ".jpeg", ".png", ".webp"):
                        mime = "image/png" if fext == ".png" else "image/webp" if fext == ".webp" else "image/jpeg"
                        items.append({
                            "name": bn,
                            "mime": mime,
                            "b64": base64.b64encode(raw).decode("ascii"),
                            "pageStart": 1,
                            "pageEnd": 1,
                        })
        elif ext == ".pdf":
            with open(path, "rb") as f:
                items.extend(split_pdf_bytes(f.read(), orig_name, 8))
        elif ext in (".jpg", ".jpeg", ".png", ".webp"):
            with open(path, "rb") as f:
                mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
                items.append({
                    "name": orig_name,
                    "mime": mime,
                    "b64": base64.b64encode(f.read()).decode("ascii"),
                    "pageStart": 1,
                    "pageEnd": 1,
                })
        print(json.dumps({"success": True, "items": items}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "message": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
