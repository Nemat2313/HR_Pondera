#!/usr/bin/env python3
"""
Extracts PDF/image files from a .zip archive or splits large multi-page PDFs
into <= 8-page PDF chunks for Gemini Vision OCR, and optionally writes each
individual 1-page PDF/image to pages_out_dir so every receipt can be viewed
and attached to 1C (Catalog_АвансовыйПлатежИностранцаПоНДФЛПрисоединенныеФайлы).
"""
import base64
import io
import json
import os
import sys
import zipfile


def split_pdf_bytes(raw: bytes, filename: str, pages_out_dir: str, page_offset: int, chunk_size: int = 8):
    saved_pages = []
    try:
        from pypdf import PdfReader, PdfWriter
        reader = PdfReader(io.BytesIO(raw))
        total = len(reader.pages)

        if pages_out_dir:
            os.makedirs(pages_out_dir, exist_ok=True)
            for p_idx in range(total):
                g_page = page_offset + p_idx + 1
                w_single = PdfWriter()
                w_single.add_page(reader.pages[p_idx])
                s_buf = io.BytesIO()
                w_single.write(s_buf)
                s_bytes = s_buf.getvalue()
                out_name = f"receipt_p{g_page:03d}.pdf"
                out_path = os.path.join(pages_out_dir, out_name)
                with open(out_path, "wb") as out_f:
                    out_f.write(s_bytes)
                saved_pages.append({
                    "page": g_page,
                    "fileName": out_name,
                    "mime": "application/pdf",
                    "size": len(s_bytes),
                    "path": out_path,
                })

        if total <= chunk_size:
            return [{
                "name": filename,
                "mime": "application/pdf",
                "b64": base64.b64encode(raw).decode("ascii"),
                "pageStart": page_offset + 1,
                "pageEnd": page_offset + total,
            }], saved_pages, total

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
                "pageStart": page_offset + start + 1,
                "pageEnd": page_offset + end,
            })
        return chunks, saved_pages, total
    except Exception:
        if pages_out_dir:
            os.makedirs(pages_out_dir, exist_ok=True)
            g_page = page_offset + 1
            out_name = f"receipt_p{g_page:03d}.pdf"
            out_path = os.path.join(pages_out_dir, out_name)
            with open(out_path, "wb") as out_f:
                out_f.write(raw)
            saved_pages.append({
                "page": g_page,
                "fileName": out_name,
                "mime": "application/pdf",
                "size": len(raw),
                "path": out_path,
            })
        return [{
            "name": filename,
            "mime": "application/pdf",
            "b64": base64.b64encode(raw).decode("ascii"),
            "pageStart": page_offset + 1,
            "pageEnd": page_offset + 1,
        }], saved_pages, 1


def save_single_image(raw: bytes, fext: str, pages_out_dir: str, g_page: int):
    mime = "image/png" if fext == ".png" else "image/webp" if fext == ".webp" else "image/jpeg"
    ext_clean = ".png" if fext == ".png" else ".webp" if fext == ".webp" else ".jpg"
    if not pages_out_dir:
        return None
    os.makedirs(pages_out_dir, exist_ok=True)
    out_name = f"receipt_p{g_page:03d}{ext_clean}"
    out_path = os.path.join(pages_out_dir, out_name)
    with open(out_path, "wb") as out_f:
        out_f.write(raw)
    return {
        "page": g_page,
        "fileName": out_name,
        "mime": mime,
        "size": len(raw),
        "path": out_path,
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "message": "Missing file path"}))
        return
    path = sys.argv[1]
    orig_name = sys.argv[2] if len(sys.argv) > 2 else os.path.basename(path)
    pages_out_dir = sys.argv[3] if len(sys.argv) > 3 else ""
    ext = os.path.splitext(orig_name.lower())[1]
    items = []
    pages = []
    page_offset = 0

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
                        ch, sp, cnt = split_pdf_bytes(raw, bn, pages_out_dir, page_offset, 8)
                        items.extend(ch)
                        pages.extend(sp)
                        page_offset += cnt
                    elif fext in (".jpg", ".jpeg", ".png", ".webp"):
                        mime = "image/png" if fext == ".png" else "image/webp" if fext == ".webp" else "image/jpeg"
                        g_page = page_offset + 1
                        items.append({
                            "name": bn,
                            "mime": mime,
                            "b64": base64.b64encode(raw).decode("ascii"),
                            "pageStart": g_page,
                            "pageEnd": g_page,
                        })
                        sp = save_single_image(raw, fext, pages_out_dir, g_page)
                        if sp:
                            pages.append(sp)
                        page_offset += 1
        elif ext == ".pdf":
            with open(path, "rb") as f:
                ch, sp, _ = split_pdf_bytes(f.read(), orig_name, pages_out_dir, 0, 8)
                items.extend(ch)
                pages.extend(sp)
        elif ext in (".jpg", ".jpeg", ".png", ".webp"):
            with open(path, "rb") as f:
                raw = f.read()
                mime = "image/png" if ext == ".png" else "image/webp" if ext == ".webp" else "image/jpeg"
                items.append({
                    "name": orig_name,
                    "mime": mime,
                    "b64": base64.b64encode(raw).decode("ascii"),
                    "pageStart": 1,
                    "pageEnd": 1,
                })
                sp = save_single_image(raw, ext, pages_out_dir, 1)
                if sp:
                    pages.append(sp)
        print(json.dumps({"success": True, "items": items, "pages": pages}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"success": False, "message": str(e)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
