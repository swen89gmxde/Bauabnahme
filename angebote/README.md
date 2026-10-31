# Kommissionsbezogenes Angebotsportal

Stand 31.10.2026. Erweiterung im Verzeichnis `angebote/`; die bestehende Bauabnahme bleibt unverändert.

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

Die Vorschau schließt den Vorgang noch nicht. Erst der ausdrückliche Abschluss übermittelt die unterschriebene PDF und den zugehörigen Unterlagenstand an den Server. Der Server prüft Original-Hash, Dokumentliste, Sitzung und Abschlusskennung und speichert die PDF privat auf STRATO. Der Vorgang wechselt zunächst auf `archive_pending`. Die gespeicherte Unterschrift kann ab diesem Zeitpunkt nicht erneut geändert oder überschrieben werden. Gleiche Wiederholungen setzen die Archivierung fort; abweichende Abschlüsse werden abgewiesen.

Anschließend werden die unterschriebene PDF, das Original, alle freigegebenen Anlagen einschließlich AGB/Widerruf und ein Unterlagenverzeichnis in einen eigenen privaten Drive-Ordner je Kundenkennung, Kommission und Freigabe übertragen. Vorab erzeugte Drive-Datei-IDs werden vor dem Upload lokal festgehalten. Wiederholungen verwenden dieselben IDs und erzeugen keine zweite Datei. Auch bei einer verlorenen Upload-Antwort wird erst die vorhandene Datei geprüft. HTTP-Erfolg oder ein vorhandener Dateiname gelten nicht als Sicherungsnachweis: Zielordner, Freigabezuordnung, Dateityp, Größe und SHA-256 werden separat zurückgelesen. Falls Google keinen SHA-256-Wert liefert, wird die Datei vollständig zurückgelesen und gehasht. Öffentlich oder anderweitig geteilte Archivordner und -dateien werden abgewiesen.

Erst nach erfolgreicher Prüfung aller Dateien wird `completed` gesetzt und der Kundenlink für Original, Anlagen und weitere Unterschriften gesperrt. Die STRATO-Kopie wird nicht gelöscht. Bei `archive_pending` bleiben der Kundenzugang und die vorhandenen Unterlagen erreichbar; die ursprüngliche Linkfrist schließt diesen bereits angenommenen Vorgang nicht vor erfolgreicher Sicherung. Eine neue Freigabe derselben Kommission ist währenddessen blockiert. Unberührte Angebote laufen weiterhin regulär ab. Eine ausdrückliche administrative Sperre bleibt als gesonderter Vorgang möglich und darf nicht als erfolgreiche Archivierung bezeichnet werden.

Archivierungsfehler werden ohne Geheimnisse im Vorgang vermerkt. Die Verwaltung erlaubt den Download der lokalen unterschriebenen PDF und einen erneuten Archivierungsversuch. Das Kundenfenster fragt den Status begrenzt erneut ab. Für vom Kundenfenster unabhängige Wiederholungen muss zusätzlich der geplante STRATO-Aufruf von `server/archive-worker.php` installiert werden. Die Prüflogik wird niemals abgeschaltet, um einen Uploadfehler zu umgehen. Schreibvorgänge sind pro Kommission und Freigabe über Dateisperren serialisiert.

Die fertige PDF bleibt im geöffneten Fenster verfügbar und wird erst mit einem weiteren Button über die native Gerätefunktion geteilt. Der Nutzer wählt WhatsApp und den Chat selbst. App-Übergabe ist keine Versandbestätigung. Bei abgebrochenem Teilen kann Sichtwerk die gespeicherte unterschriebene PDF aus der Verwaltung laden. Alle damaligen Unterlagen inklusive Original, Anlagen, Unterlagenverzeichnis und unterschriebener PDF sind als geschützter ZIP-Archivexport abrufbar. Bereits heruntergeladene Kopien auf fremden Geräten können nicht zurückgerufen werden.

Ein erneut aufgerufener abgeschlossener, gesperrter, ersetzter oder abgelaufener Kundenlink zeigt keine Kundenunterlagen mehr. Der Betrieb behält die Archivdaten; diese Erweiterung löscht abgeschlossene Vertragsunterlagen nicht automatisch. Archivierung, Sicherungen und Aufbewahrungs-/Löschregeln sind betrieblich festzulegen.

## STRATO-Einrichtung und tatsächlicher Betrieb

- PHP >= 8.1, HTTPS sowie `session`, `fileinfo`, `json`, `curl` und `zip` bereitstellen. Für 60-MB-Pakete `post_max_size` mindestens 65M, `upload_max_filesize` mindestens 20M und ausreichende `max_file_uploads` vorsehen.
- Die Anwendung aus `angebote/` mit `vendor/`, `server/`, `vertragsunterlagen/` und `legal-current.json` auf den Webspace kopieren. `.mjs` als JavaScript ausliefern. Die `.htaccess` enthält dies sowie zusätzliche Schutzheader. `angebote-tests/`, Entwicklungsabhängigkeiten und Testdaten nicht deployen.
- `config.php` und alle privaten Daten müssen außerhalb von `DOCUMENT_ROOT` liegen. `SICHTWERK_SIGN_CONFIG` kann den privaten Konfigurationspfad festlegen; sonst gilt `dirname(DOCUMENT_ROOT)/sichtwerk-signieren-private/config.php`. Die Anwendung prüft den Ablageort. Ein Sperrvermerk in `.htaccess` allein genügt nicht.
- In der privaten Konfiguration den tatsächlichen HTTPS-Ursprung, ein mit `password_hash` erzeugtes Admin-Passwort-Hash und den privaten Datenpfad setzen. Keine Zugangsdaten in GitHub speichern. `SICHTWERK_TEST_HTTP` ist ausschließlich für lokale synthetische Tests und darf im öffentlichen Betrieb nicht aktiviert sein.
- Mit synthetischen Angeboten Kundenwechsel, Anhangtrennung, falsche Codes, Revision, Abschluss, Wiederholung, Archiv und Ablauf auf dem tatsächlichen Webspace testen. Anschließend echte iPhone-/Android-/WhatsApp-Gerätetests durchführen. Bisherige automatisierte PHP-Tests und Browserprüfungen ersetzen diese nicht.

## Private Drive-Anbindung und geplanter Wiederholungsdienst

Die ChatGPT-Drive-Verbindung wird nicht an STRATO weitergereicht und reicht für diese unbeaufsichtigte Übertragung nicht aus. Für die eigene Serveranwendung einmal einen Google-OAuth-Web-Client einrichten, den Zugriff durch den Inhaber freigeben und den Offline-Zugang sicher hinterlegen. Bevorzugt den begrenzten `drive.file`-Zugriff nutzen. Ein bereits bestehender Zielordner muss für genau diese Anwendung ausgewählt bzw. freigegeben sein; bloße Kenntnis einer Ordner-ID gewährt keinen Zugriff. Der Archivordner muss privat und beschreibbar sein. Keine Berechtigungen automatisch erweitern oder öffentliche Freigaben anlegen.

`drive_archive.folder_id`, `client_id`, `client_secret` und `refresh_token` ausschließlich in der privaten `config.php` außerhalb des öffentlichen Webverzeichnisses eintragen. Die Beispielkonfiguration enthält absichtlich keine Werte. Ohne diese Angaben blockiert der Server neue echte Kundenfreigaben. Eine positive Konfigurationsanzeige prüft nur das Vorhandensein der Angaben; eine tatsächlich funktionierende Verbindung wird erst durch einen erfolgreichen Testabschluss mit Rücklesen aller Drive-Dateien nachgewiesen.

Die Übertragung erfolgt über die offiziellen HTTPS-Endpunkte, mit Zertifikatsprüfung und ohne Weiterleitung von Autorisierungsdaten auf fremde Hosts. Resumable-Uploads unterstützen auch die zulässigen größeren PDFs. Fortschritte werden nach jeder Datei festgehalten; Standard sind zwei Dateien pro Aufruf. Fehlgeschlagene Jobs bekommen einen wachsenden Abstand zwischen Wiederholungen. Eine geänderte oder verschwundene bereits übertragene Datei verhindert den Abschluss und muss geprüft werden.

Auf STRATO einen geplanten CLI-Aufruf, beispielsweise alle fünf Minuten, für `archive-worker.php` mit der Umgebungsvariable `SICHTWERK_SIGN_CONFIG` auf die private Konfiguration einrichten. Den absoluten PHP- und Skriptpfad erst aus dem tatsächlichen Hosting ableiten. Dieser Worker ist ausschließlich für CLI-Aufrufe bestimmt und antwortet über HTTP mit 404. Einen Cronjob erst nach tatsächlicher Einrichtung und Test als aktiv bezeichnen. Die Anwendung versendet bislang keine automatische E-Mail.

Vor dem Echtbetrieb einen synthetischen Abschluss auf STRATO durchführen, die PDF und das vollständige Drive-Paket öffnen und prüfen, anschließend die Sperre des Kundenlinks kontrollieren. Zusätzlich Uploadfehler, Wiederaufnahme ohne Kundenbrowser, Verwaltung, Google-Autorisierung und Aufbewahrungs-/Löschregeln prüfen. Google-OAuth-Freigabe, private Serverinstallation und Cronjob sind nicht durch eine GitHub-Veröffentlichung erledigt.

Primärquellen: https://developers.google.com/workspace/drive/api/guides/manage-uploads , https://developers.google.com/workspace/drive/api/guides/create-file , https://developers.google.com/workspace/drive/api/reference/rest/v3/files , https://developers.google.com/identity/protocols/oauth2/web-server .

## Vertragsablauf vor produktivem Online-Abschluss

Diese technische Erweiterung bearbeitet die bestehenden AGB und Widerrufstexte nicht inhaltlich und behauptet keine rechtliche Gesamtprüfung. Der zu verwendende Dokumenttyp hängt von Vertragsart und Abschlusssituation ab. Die aktuelle Widerrufsvorlage ist für Werk-/Montageverträge bestimmt; sie ist keine universelle Fassung für jeden Vertrag.

Wird die Annahme über die Plattform elektronisch entgegengenommen, vor dem Produktivbetrieb den tatsächlichen Ablauf einschließlich hervorgehobener Vertragsinformationen und eindeutiger zahlungspflichtiger Bestätigung nach § 312j BGB prüfen und gegebenenfalls ergänzen. Bei einschlägigen Fernabsatzverträgen verlangt § 356a BGB eine leicht zugängliche elektronische Widerrufsfunktion mit Eingangsbestätigung. Diese Funktion muss unabhängig vom nach Unterschrift gesperrten Signierlink bestehen. Der PDF-Download allein stellt sie nicht bereit; diese Erweiterung implementiert sie nicht. Die konkrete Freischaltung für solche Verträge ist erst nach Erledigung dieser Punkte vorgesehen. Quellen: https://www.gesetze-im-internet.de/bgb/__312j.html und https://www.gesetze-im-internet.de/bgb/__356a.html .

Datenschutzhinweise um das tatsächlich eingesetzte Hosting, Kundenpakete, Codesitzungen, serverseitige Abschlussablage, die zusätzliche private Drive-Archivierung und selbst ausgelöstes Geräte-Teilen ergänzen. Die Unterschrift ist eine Fingerzeichnung ohne Zertifikatsprüfung und keine Garantie für Identität, Integrität oder Beweiskraft.

## Entwicklung

Buildlose Browseranwendung; zur Laufzeit keine externen CDNs. pdf-lib 1.17.1, PDF.js 5.6.205 Legacy und signature_pad 4.1.7 liegen mit Lizenzen in `vendor/`.

Für lokale Tests die Entwicklungsabhängigkeiten aus `package.json` installieren. `node angebote-tests/stamp.mjs`, `node angebote-tests/backend.mjs` und `node angebote-tests/check-legal.mjs` ausführen. `CODEX_PRIMARY_RUNTIME_NODE_MODULES` beziehungsweise `PHP_WASM_MODULE_ROOT` können vorhandene Entwicklungsabhängigkeiten referenzieren. `npm run dev` unter `http://localhost:4173` ist ausschließlich eine interne Vorschau mit synthetischen Testvorgängen und wird nicht öffentlich deployt. Die generierten privaten Testverzeichnisse und Zugangsdaten sind von Git ausgeschlossen.

Die verwaltete Browser-Vorschau unter einer unverschlüsselten `.local`-Adresse bietet kein Web Crypto. Dort lässt sich die vollständige PHP-/Browser-Kette deshalb nicht verifizieren; ohne HTTPS wird kein Hashvergleich umgangen. Die öffentliche GitHub-Demo wird getrennt über HTTPS geprüft.
