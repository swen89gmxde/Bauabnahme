# Angebote per Finger unterschreiben – erster Entwurf

Stand: 29.10.2026. Ergänzung im Unterverzeichnis `angebote/`; die bestehende Bauabnahme bleibt unverändert.

## Öffentlicher Test

`https://swen89gmxde.github.io/Bauabnahme/angebote/`

Der Link öffnet ein vierseitiges, ausdrücklich unverbindliches Musterangebot ohne Kundendaten. Name, Datum und Fingerzeichnung werden als schwarzer, deckender PDF-Seiteninhalt eingesetzt. Es wird die ganze PDF mit allen Seiten ausgegeben. Die fertige Datei wird vor dem Teilen erzeugt; ein eigener Button ruft anschließend direkt aus der Nutzeraktion das native Teilen auf. Der Nutzer wählt WhatsApp und den bestehenden Chat selbst. Übergabe an eine App ist keine Versand- oder Empfangsbestätigung.

Auf Browsern ohne Datei-Teilen werden Öffnen und Speichern der fertigen PDF angeboten. Ein echter iPhone-/Android-/WhatsApp-Gerätetest steht noch aus. PDF-Ausgabe und Bedienung wurden im Browser bei Smartphone-Breite geprüft.

## Vorbereitung einer Lexware-PDF

`?vorbereiten=1` öffnet die Sichtwerk-Vorbereitung. PDFs werden zunächst lokal gelesen. Ein geeigneter Kundenblock mit Datum/Unterschrift wird anhand der Textpositionen vorgeschlagen. Bekannte vorbereitete PDFs können außerdem ihre Platzierung als `/SichtwerkSigning`-Metadaten mitbringen. Rasterisierte Seiten, unbekannte Layouts oder zu enge Zeilen werden nicht blind bestempelt: Datum und Unterschriftsfläche lassen sich auf der richtigen Seite markieren. Vor dem Link ist die sichtbare Platzierung zu bestätigen.

Name wird lesbar unter die Fingerunterschrift gesetzt. Datum kommt in die eigene Zeile. Seitenzahl, Seitenformat und übriger Angebotstext bleiben erhalten. Gedrehte oder beschnittene Signierseiten sowie bereits vorhandene digitale Signaturen werden abgewiesen. Formularfelder oder Stempel innerhalb der Zielfläche werden nicht übermalt. Bereits handschriftlich unterschriebene Scans können technisch nicht zuverlässig erkannt werden; immer eine ununterzeichnete Quelle verwenden.

Der lokale Probelauf lädt nichts hoch. Seine Ausgabe ist ausdrücklich als PROBELAUF markiert und dient nicht der Angebotsannahme.

## Echte individuelle Kundenlinks: einmalige Einrichtung auf STRATO

GitHub Pages führt kein PHP aus. Deshalb ist die öffentliche Seite bisher ein Funktionstest; der Button für echte Kundenlinks ist dort gesperrt. Keine Kunden-PDFs, Unterschriften, Zugangsdaten oder individuellen Kundenlinks in das öffentliche Repository hochladen.

Die vollständige Anwendung kann aus diesem Verzeichnis auf dem vorhandenen STRATO-Webspace unter `/angebote/` betrieben werden:

1. PHP >= 8.1 mit `session`, `fileinfo`, `json`, HTTPS sowie ausreichenden Uploadgrenzen bereitstellen. Für 20-MB-PDFs `upload_max_filesize` >= 20M und `post_max_size` >= 22M setzen.
2. Einen privaten Ordner **außerhalb von DOCUMENT_ROOT** anlegen. `server/config.example.php` dort als `config.php` anlegen; Pfad per Server-Umgebungsvariable `SICHTWERK_SIGN_CONFIG` setzen oder den Standardpfad `dirname(DOCUMENT_ROOT)/sichtwerk-signieren-private/config.php` nutzen. Der Schutz wird serverseitig geprüft; eine `.htaccess`-Sperre allein genügt hier nicht.
3. `origin` auf den tatsächlichen HTTPS-Ursprung setzen, `data_dir` auf einen privaten Pfad außerhalb des Webroots. `password_hash` mit PHP `password_hash` für ein langes, eigenes Admin-Passwort erzeugen. Niemals Klartextpasswort oder Konfiguration ins Repository schreiben. Einrichtung und Zugangsdaten sind in diesem Entwurf noch nicht auf STRATO installiert.
4. Alle öffentlichen Dateien aus diesem Ordner einschließlich `vendor/` und `server/api.php` auf den Webspace kopieren. `.mjs` muss als JavaScript ausgeliefert werden; die mitgelieferte `.htaccess` enthält dies und zusätzliche Browser-Schutzheader. Keine Testdateien/privaten Angebote mitkopieren.
5. Vorbereitung öffnen, als Sichtwerk anmelden, ein unverbindliches Muster hochladen, Platzierung bestätigen, Link öffnen und Sperren/Ablauf testen. Erst nach dem Gerätetest echte Kundenangebote bereitstellen.

Nach Einrichtung: Als Sichtwerk anmelden → Lexware-PDF auswählen → markierte Flächen prüfen → Kundenlink erstellen → Angebot und genau diesen Link in WhatsApp senden. Der Link enthält ein zufälliges 256-Bit-Zugangsgeheimnis im Fragment (`#auftrag=...`) und ist standardmäßig 14 Tage gültig. Jeder, der den Link erhält, kann das Angebot öffnen. Er ist in der Vorbereitung sperrbar. Zugriff wird bei Ablauf sofort verweigert; abgelaufene Dateien werden beim nächsten Upload bereinigt. Für zeitnahe physische Löschung auch ohne weitere Uploads einen täglichen Bereinigungslauf einrichten.

Die API verwendet passwortgeschützte Admin-Sitzungen, CSRF-Schutz und begrenzte Anmeldeversuche. PDFs und Angebotsmetadaten werden außerhalb des öffentlichen Webverzeichnisses gespeichert; der Kunde lädt das Original anhand des Links. Der SHA-256-Wert bindet die geladenen Bytes an die Angebotsmetadaten. Unterschrift und Name werden im Browser verarbeitet; es gibt keinen automatischen Rückversand und keine serverseitige Ablage der fertigen Unterschrift. Ohne Teilen oder Speichern geht die fertige Datei beim Schließen verloren.

## Hinweise für den Einsatz

Die Fingerzeichnung ist keine Zertifikatsignatur; es gibt keine verifizierte Identität, manipulationssichere Zeitangabe oder garantierte Beweiskraft. Vertragsinhalte und Widerrufsablauf werden nicht geändert oder rechtlich neu geprüft. Alle zugehörigen Anlagen müssen vor der Linkerstellung im Angebot enthalten sein. Die Anwendung unterstützt im ersten Entwurf die Kundenannahme; sie ist noch kein getrenntes Versicherer-Freigabeformular mit Schadennummer und Übernahmebeträgen.

Vor echtem Einsatz die Datenschutzhinweise der Website um die geschützte Bereitstellung, Linkgültigkeit, lokale Signaturverarbeitung und anschließende freiwillige Weitergabe über das Geräte-Teilen ergänzen. Der Entwurf behauptet keine bereits erfolgte Änderung der STRATO-Website, AGB oder Lexware.

## Bibliotheken

Lokal mitgeliefert, keine externen CDNs zur Laufzeit: pdf-lib 1.17.1 (MIT), PDF.js 5.6.205 Legacy-Build (Apache 2.0), signature_pad 4.1.7 (MIT). Lizenzen in `vendor/`. `isEvalSupported` ist deaktiviert. Keine Analyse-Skripte und kein lokales Speichern von Signaturen.
