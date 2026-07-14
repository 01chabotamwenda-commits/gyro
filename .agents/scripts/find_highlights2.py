import fitz
doc = fitz.open("attached_assets/thesis_(1)_1783629356237.pdf")
count=0
for pno in range(doc.page_count):
    page = doc[pno]
    annots = page.annots()
    if not annots:
        continue
    for a in annots:
        count+=1
print("total annots", count)
