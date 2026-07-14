import fitz
doc = fitz.open("attached_assets/thesis_(1)_1783629356237.pdf")
for pno in range(doc.page_count):
    page = doc[pno]
    annots = page.annots()
    if not annots:
        continue
    for a in annots:
        info = a.info
        rect = a.rect
        # get text under the highlight
        words = page.get_text("words")
        text = ""
        try:
            quad_points = a.vertices
        except Exception:
            quad_points = None
        clip_text = page.get_textbox(rect)
        print(f"PAGE {pno+1} type={a.type[1]} rect={rect} content={info.get('content','')!r} text={clip_text!r}")
