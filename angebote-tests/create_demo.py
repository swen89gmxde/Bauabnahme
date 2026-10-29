from pathlib import Path
from reportlab.pdfgen import canvas
import json
p=Path(__file__).resolve().parents[1]/'angebote'
w,h=595.92,841.92
c=canvas.Canvas(str(p/'musterangebot.pdf'),pagesize=(w,h))
c.setTitle('MUSTER – Angebot DEMO-0162 · Sichtwerk – Neubauer')
for n in range(1,5):
 c.setFillColorRGB(.07,.25,.28);c.rect(0,h-93,w,93,fill=1,stroke=0)
 c.setFillColorRGB(1,1,1);c.setFont('Helvetica-Bold',19);c.drawString(54,h-44,'SICHTWERK – NEUBAUER')
 c.setFont('Helvetica',11);c.drawString(54,h-67,'MUSTERANGEBOT · DEMO-0162')
 c.setFillColorRGB(.22,.22,.22);c.setFont('Helvetica-Bold',19)
 if n==1:
  c.drawString(54,h-143,'So einfach funktioniert die Unterschrift')
  lines=['Dies ist ein unverbindliches Muster für den Funktionstest.','Es enthält keine echten Kundendaten.','Durch die Unterschrift entsteht kein Auftrag.','','1. Angebot mit allen Seiten ansehen.','2. Namen und Datum eintragen.','3. Mit dem Finger unterschreiben.','4. Fertige PDF über WhatsApp zurückteilen.']
 elif n==2:
  c.drawString(54,h-143,'Beispiel für eine Angebotsseite')
  lines=['An dieser Stelle stehen später die unveränderten','Leistungen, Preise und Summen aus Lexware Office.','','Die Signierfunktion erhält sämtliche Angebotsseiten.','Eine Unterschrift wird nur an der vorgesehenen Stelle','eingesetzt. Es wird keine zusätzliche Seite angehängt.']
 elif n==3:
  c.drawString(54,h-143,'Beigefügte Unterlagen')
  lines=['Auch Anlagen bleiben Bestandteil der vollständigen PDF.','','Für diesen Test ist diese Seite nur ein Platzhalter.','Im echten Angebot werden die zugehörigen Unterlagen','vor dem Erstellen des Kundenlinks zusammengestellt.']
 else:
  c.drawString(54,h-143,'Ihre Unterschrift')
  lines=['Nur ein unverbindlicher Funktionstest.','Diese Muster-PDF erteilt keinen Auftrag.']
 c.setFont('Helvetica',12)
 for i,line in enumerate(lines):c.drawString(54,h-180-i*25,line)
 if n==4:
  c.setFont('Helvetica',11);c.drawString(54,h-245,'Datum:')
  c.setStrokeColorRGB(.55,.65,.66);c.rect(125,h-261,414,18)
  c.drawString(54,h-285,'Unterschrift:');c.rect(145,h-322,394,52)
  c.setFont('Helvetica',10);c.drawString(54,h-370,'Name und Fingerunterschrift erscheinen rechts im Feld.')
 c.setFillColorRGB(.4,.46,.46);c.setFont('Helvetica',9);c.drawString(54,45,'MUSTER · Keine echten Kundendaten · Kein Auftrag')
 c.drawRightString(w-54,45,f'Seite {n} von 4');c.showPage()
c.save()
meta={'title':'Musterangebot DEMO-0162','filename':'Musterangebot_DEMO-0162.pdf','demo':True,'layout':{'page':3,'date':{'x':125,'y':243,'w':414,'h':18},'signature':{'x':145,'y':270,'w':394,'h':52}}}
(p/'demo.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
