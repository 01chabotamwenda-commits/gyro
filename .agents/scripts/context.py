import fitz
doc = fitz.open("attached_assets/thesis_(1)_1783629356237.pdf")
pages = [5,13,15,16,17,18,21]
for p in pages:
    print(f"===== PAGE {p} =====")
    print(doc[p-1].get_text())
    print()
