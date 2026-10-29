"""Add signing coordinates to an unsigned, already prepared PDF; preserve all page content."""
import argparse
from pathlib import Path
from pypdf import PdfReader,PdfWriter
from pypdf.generic import NameObject,NumberObject,FloatObject,DictionaryObject,ArrayObject
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('input',type=Path);p.add_argument('output',type=Path)
p.add_argument('--page',type=int,required=True,help='1-based page')
p.add_argument('--signature',type=float,nargs=4,required=True,metavar=('X','TOP','WIDTH','HEIGHT'))
p.add_argument('--date',type=float,nargs=4,required=True,metavar=('X','TOP','WIDTH','HEIGHT'))
a=p.parse_args()
if a.input.resolve()==a.output.resolve():raise SystemExit('Preserve the original: choose a different output path.')
r=PdfReader(a.input)
if r.is_encrypted:raise SystemExit('Use an unencrypted, unsigned source PDF.')
if not 1<=a.page<=len(r.pages):raise SystemExit('Invalid signing page.')
for f in (r.get_fields() or {}).values():
 if f.get('/FT')=='/Sig' and f.get('/V'):raise SystemExit('Do not modify a digitally signed PDF.')
page=r.pages[a.page-1]
if page.rotation or list(page.cropbox)!=list(page.mediabox):raise SystemExit('Use a straight page without cropping.')
w,h=map(float,(page.mediabox.width,page.mediabox.height))
for values in (a.signature,a.date):
 x,y,rw,rh=values
 if min(x,y)<0 or rw<40 or rh<12 or x+rw>w or y+rh>h:raise SystemExit('Invalid signing area.')
s=a.signature;d=a.date
if s[3]<25 or (s[0]<d[0]+d[2] and s[0]+s[2]>d[0] and s[1]<d[1]+d[3] and s[1]+s[3]>d[1]):raise SystemExit('Signing areas overlap or are too small.')
writer=PdfWriter();writer.clone_document_from_reader(r)
writer.root_object[NameObject('/SichtwerkSigning')]=DictionaryObject({NameObject('/Version'):NumberObject(1),NameObject('/Page'):NumberObject(a.page-1),NameObject('/Signature'):ArrayObject([FloatObject(v) for v in a.signature]),NameObject('/Date'):ArrayObject([FloatObject(v) for v in a.date])})
a.output.parent.mkdir(parents=True,exist_ok=True)
with a.output.open('wb') as f:writer.write(f)
q=PdfReader(a.output)
assert len(q.pages)==len(r.pages)
for old,new in zip(r.pages,q.pages):assert old.get_contents().get_data()==new.get_contents().get_data()
print(f'Prepared {a.output.name}: {len(q.pages)} pages, page content unchanged.')
