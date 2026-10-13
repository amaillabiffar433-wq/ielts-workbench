from pathlib import Path
import fitz, json
from PIL import Image, ImageDraw
from luma_audit import OUT,SOURCE,digest

paths=[next(SOURCE.glob('雅思真题4-20/剑雅真题17/剑雅真题17+音频/*.pdf')),next(SOURCE.glob('雅思真题4-20/剑桥4-16PDF/*16.pdf')),next(SOURCE.glob('雅思真题4-20/剑20完整/**/*Test1.pdf'))]
for path in paths:
    doc=fitz.open(path)
    print(json.dumps(dict(path=str(path),pages=len(doc),samples=[(n,len(doc[n].get_text())) for n in [0,min(10,len(doc)-1),len(doc)-2,len(doc)-1]]),ensure_ascii=False),flush=True)
    if '17（' in path.name:
        directory=OUT/'private/c17'
        directory.mkdir(parents=True,exist_ok=True)
        texts=[p.get_text(sort=True) for p in doc]
        (directory/'pages.json').write_text(json.dumps(texts,ensure_ascii=False),encoding='utf-8')
        (directory/'source.json').write_text(json.dumps(dict(path=str(path),sha256=digest(path)),ensure_ascii=False),encoding='utf-8')
        for n,t in enumerate(texts):
            print(f'PAGE {n+1}: '+t[:120].replace('\n',' | '))
    if 'Test1' in path.name:
        directory=OUT/'private/c20-test1'
        directory.mkdir(parents=True,exist_ok=True)
        for start in range(0,len(doc),12):
            sheet=Image.new('RGB',(4*300,3*445),'#dddddd')
            draw=ImageDraw.Draw(sheet)
            for n in range(start,min(start+12,len(doc))):
                pix=doc[n].get_pixmap(matrix=fitz.Matrix(.45,.45))
                im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples)
                im.thumbnail((290,410))
                x=((n-start)%4)*300;y=((n-start)//4)*445
                sheet.paste(im,(x,y+25));draw.text((x+5,y+5),str(n+1),fill='black')
            sheet.save(directory/f'contact-{start+1}.jpg')
