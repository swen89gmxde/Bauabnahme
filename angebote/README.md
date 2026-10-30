# Kommissionsbezogenes Angebotsportal

Stand 30.10.2026. Erweiterung im Verzeichnis `angebote/`; die bestehende Bauabnahme bleibt unverändert.

Öffentlicher Funktionstest: https://swen89gmxde.github.io/Bauabnahme/angebote/

Auf GitHub Pages läuft weiterhin ausschließlich der unverbindliche Musterablauf. Der allgemeine Musterlink darf wiederholt ausprobiert werden; er zeigt keine echten Kundendaten. Individuelle Kundenlinks, PINs, Abschlussarchiv und Sperren benötigen den PHP-Server auf dem privaten Webspace. Eine GitHub-Veröffentlichung installiert diesen nicht automatisch.

## Kunden und Freigaben

Eine Freigabe ist fest an Kundenkennung, Kundenname, Kommission, Angebots-PDF, Signierflächen und Unterlagenpaket gebunden. Für jede neue Freigabe wird ein neuer zufälliger 256-Bit-Link erzeugt. Die Daten stehen nicht unter einer wechselnden `latest.pdf`-URL. Neue Freigaben derselben Kunden-Kommissions-Kombination sperren den alten Link; andere Kommissionen bleiben davon getrennt.

Der zusätzliche sechsstellige Kundencode ist standardmäßig eingeschaltet. Er wird nur als Passwort-Hash gespeichert, ist vor Einsicht in die Kundendaten erforderlich und wird durch begrenzte Versuche geschützt. Link und Code dürfen nur dem vorgesehenen Kunden mitgeteilt werden. Das ist Zugangsschutz, keine verifizierte Identität; weitergegebene Zugangsdaten können von Dritten genutzt werden.

Der Token steht im URL-Fragment und wird der API im Header übergeben. Zugriff und Status werden für jede Original-PDF, jede Anlage und die Abschlussfunktion serverseitig geprüft. Ein fremder Anhang-Identifier allein gewährt keinen Zugriff. Link, Code oder Dateiname werden nicht als frei auswählbarer Dateisystempfad verwendet.

## Unterlagen und Vorlagen

Der Kunde sieht vor der Unterschrift große Download-Buttons für die zu dieser Freigabe gehörenden Unterlagen. AGB und die kombinierte Widerrufsbelehrung mit Musterformular werden automatisch als feste Kopien übernommen. Zusätzlich können bis zu zwölf PDFs, Word-Dateien (.doc/.docx), JPG-, PNG- oder WebP-Bilder bereitgestellt werden. 20 MB je Datei, insgesamt 60 MB zuzüglich der allgemeinen Vertragsvorlagen. Diese Grenzen müssen zur Webspace-Konfiguration passen. Aktive Dateitypen wie HTML/SVG und makrohaltige DOCX-Pakete werden nicht akzeptiert. Alte binäre DOC-Dateien werden als Download behandelt und nicht ausgeführt oder in der Seite dargestellt.

Die allgemeinen, zur Veröffentlichung freigegebenen Unternehmensvorlagen liegen versioniert in `vertragsunterlagen/`. `legal-current.json` enthält die Freigabeversionen, Größen und SHA-256-Werte. Der Server prüft diese Freigabe bei angemeldeten Verwaltungszugriffen und übernimmt einen geänderten veröffentlichten Stand automatisch in seine Mastervorlagen. Neue Kundenfreigaben übernehmen anschließend die aktuellen Master. Ein manueller Vorlagen-Upload in der Verwaltung ist ebenfalls möglich; er bleibt aktiv, bis eine neue gebündelte Freigabe veröffentlicht wird.

Bereits freigegebene Pakete ändern sich bei einem Master-Update nicht. Offene Vorgänge mit älterem Stand werden in der Verwaltung markiert. Für notwendige Änderungen wird die Kommission erneut freigegeben; damit erhält der Kunde einen neuen Link und der alte wird gesperrt. Unterschriebene Pakete behalten ihre damaligen Versionen. Die aktuelle öffentliche Vorlage ist keine nachträgliche Änderung eines bestehenden Vertrags.

`node angebote-tests/check-legal.mjs` prüft Vorlagendateien, Prüfsummen und Demo-Verweise. Dieselbe Prüfung läuft über `.github/workflows/angebote-check.yml` bei relevanten GitHub-Änderungen. Eine Änderung in Drive allein aktualisiert GitHub oder STRATO nicht: Die zugehörige Veröffentlichung gehört laut Projektanweisung in denselben Arbeitsgang. Kein unverifizierter Hintergrundabgleich wird behauptet.

## Unterschreiben und Sperren

Der Kunde liest sein Angebot und die Unterlagen, trägt Name und Datum ein und zeichnet mit dem Finger. Die vollständige PDF bleibt mit allen Seiten erhalten. Name, Datum und schwarze Unterschrift werden in die geprüften Flächen eingesetzt; ein Dokumentverzeichnis mit Prüfsummen wird zusätzlich als PDF-Metadatum gespeichert.

Die Vorschau schließt den Vorgang noch nicht. Erst der ausdrückliche Abschluss übermittelt die unterschriebene PDF und den zugehörigen Unterlagenstand an den Server. Der Server prüft Original-Hash, Dokumentliste, Sitzung und Abschlusskennung, speichert die Datei und setzt den Vorgang auf `completed`. Danach verweigert derselbe Kundenlink alle erneuten Angebots- und Anlagenzugriffe, Öffnungen und weiteren Unterschriften. Eine identische Wiederholung nach einem Verbindungsabbruch bestätigt nur den bereits gespeicherten Abschluss. Eine zweite abweichende Unterschrift wird nicht angenommen. Schreibvorgänge sind pro Kommission und Freigabe über Dateisperren serialisiert.

Die fertige PDF bleibt im geöffneten Fenster verfügbar und wird erst mit einem weiteren Button über die native Gerätefunktion geteilt. Der Nutzer wählt WhatsApp und den Chat selbst. App-Übergabe ist keine Versandbestätigung. Bei abgebrochenem Teilen kann Sichtwerk die gespeicherte unterschriebene PDF aus der Verwaltung laden. Alle damaligen Unterlagen inklusive Original, Anlagen, Unterlagenverzeichnis und unterschriebener PDF sind als geschützter ZIP-Archivexport abrufbar. Bereits heruntergeladene Kopien auf fremden Geräten können nicht zurückgerufen werden.

Ein erneut aufgerufener abgeschlossener, gesperrter, ersetzter oder abgelaufener Kundenlink zeigt keine Kundenunterlagen mehr. Der Betrieb behält die Archivdaten; diese Erweiterung löscht abgeschlossene Vertragsunterlagen nicht automatisch. Archivierung, Sicherungen und Aufbewahrungs-/Löschregeln sind betrieblich festzulegen.

## STRATO-Einrichtung und tatsächlicher Betrieb

- PHP >= 8.1, HTTPS sowie `session`, `fileinfo`, `json` und `zip` bereitstellen. Für 60-MB-Pakete `post_max_size` mindestens 65M, `upload_max_filesize` mindestens 20M und ausreichende `max_file_uploads` vorsehen.
- Die Anwendung aus `angebote/` mit `vendor/`, `server/`, `vertragsunterlagen/` und `legal-current.json` auf den Webspace kopieren. `.mjs` als JavaScript ausliefern. Die `.htaccess` enthält dies sowie zusätzliche Schutzheader. `angebote-tests/`, Entwicklungsabhängigkeiten und Testdaten nicht deployen.
- `config.php` und alle privaten Daten müssen außerhalb von `DOCUMENT_ROOT` liegen. `SICHTWERK_SIGN_CONFIG` kann den privaten Konfigurationspfad festlegen; sonst gilt `dirname(DOCUMENT_ROOT)/sichtwerk-signieren-private/config.php`. Die Anwendung prüft den Ablageort. Ein Sperrvermerk in `.htaccess` allein genügt nicht.
- In der privaten Konfiguration den tatsächlichen HTTPS-Ursprung, ein mit `password_hash` erzeugtes Admin-Passwort-Hash und den privaten Datenpfad setzen. Keine Zugangsdaten in GitHub speichern. `SICHTWERK_TEST_HTTP` ist ausschließlich für lokale synthetische Tests und darf im öffentlichen Betrieb nicht aktiviert sein.
- Mit synthetischen Angeboten Kundenwechsel, Anhangtrennung, falsche Codes, Revision, Abschluss, Wiederholung, Archiv und Ablauf auf dem tatsächlichen Webspace testen. Anschließend echte iPhone-/Android-/WhatsApp-Gerätetests durchführen. Bisherige automatisierte PHP-Tests und Browserprüfungen ersetzen diese nicht.

## Vertragsablauf vor produktivem Online-Abschluss

Diese technische Erweiterung bearbeitet die bestehenden AGB und Widerrufstexte nicht inhaltlich und behauptet keine rechtliche Gesamtprüfung. Der zu verwendende Dokumenttyp hängt von Vertragsart und Abschlusssituation ab. Die aktuelle Widerrufsvorlage ist für Werk-/Montageverträge bestimmt; sie ist keine universelle Fassung für jeden Vertrag.

Wird die Annahme über die Plattform elektronisch entgegengenommen, vor dem Produktivbetrieb den tatsächlichen Ablauf einschließlich hervorgehobener Vertragsinformationen und eindeutiger zahlungspflichtiger Bestätigung nach § 312j BGB prüfen und gegebenenfalls ergänzen. Bei einschlägigen Fernabsatzverträgen verlangt § 356a BGB eine leicht zugängliche elektronische Widerrufsfunktion mit Eingangsbestätigung. Diese Funktion muss unabhängig vom nach Unterschrift gesperrten Signierlink bestehen. Der PDF-Download allein stellt sie nicht bereit; diese Erweiterung implementiert sie nicht. Die konkrete Freischaltung für solche Verträge ist erst nach Erledigung dieser Punkte vorgesehen. Quellen: https://www.gesetze-im-internet.de/bgb/__312j.html und https://www.gesetze-im-internet.de/bgb/__356a.html .

Datenschutzhinweise um das tatsächlich eingesetzte Hosting, Kundenpakete, Codesitzungen, serverseitige Abschlussablage und selbst ausgelöstes Geräte-Teilen ergänzen. Die Unterschrift ist eine Fingerzeichnung ohne Zertifikatsprüfung und keine Garantie für Identität, Integrität oder Beweiskraft.

## Entwicklung

Buildlose Browseranwendung; zur Laufzeit keine externen CDNs. pdf-lib 1.17.1, PDF.js 5.6.205 Legacy und signature_pad 4.1.7 liegen mit Lizenzen in `vendor/`.

Für lokale Tests die Entwicklungsabhängigkeiten aus `package.json` installieren. `node angebote-tests/stamp.mjs`, `node angebote-tests/backend.mjs` und `node angebote-tests/check-legal.mjs` ausführen. `CODEX_PRIMARY_RUNTIME_NODE_MODULES` beziehungsweise `PHP_WASM_MODULE_ROOT` können vorhandene Entwicklungsabhängigkeiten referenzieren. `npm run dev` unter `http://localhost:4173` ist ausschließlich eine interne Vorschau mit synthetischen Testvorgängen und wird nicht öffentlich deployt. Die generierten privaten Testverzeichnisse und Zugangsdaten sind von Git ausgeschlossen.

Die verwaltete Browser-Vorschau unter einer unverschlüsselten `.local`-Adresse bietet kein Web Crypto. Dort lässt sich die vollständige PHP-/Browser-Kette deshalb nicht verifizieren; ohne HTTPS wird kein Hashvergleich umgangen. Die öffentliche GitHub-Demo wird getrennt über HTTPS geprüft.
