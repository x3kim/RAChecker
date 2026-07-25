# Reddit-Posts

**Vor dem Posten:** Sub-Regeln lesen. Viele Subs verlangen einen Flair, erlauben Self-Promo
nur an bestimmten Tagen oder nur, wenn du sonst aktiv mitliest. 2–4 Screenshots anhängen
(in `docs/screenshots/`). Name = **RAChecker**, GitHub-Link ist unten schon eingesetzt.

Ton überall: du hast ein Tool **für dich** gebaut, teilst es, suchst Feedback — kein Verkauf.

---

## r/RetroAchievements  (Kern-Zielgruppe, darf am direktesten sein)

**Titel:**
> Ich habe ein Tool gebaut, das deine ROM-Sammlung durchsucht und zeigt, welche Dateien RA-Erfolge freischalten (offline, Open Source)

**Body:**
> Ich wollte wissen, welche meiner ROMs tatsächlich den richtigen Hash für RetroAchievements haben, ohne jede Datei einzeln in einen Emulator zu laden. Also habe ich **RAChecker** gebaut.
>
> Was es macht:
> - Scannt deinen ROM-Ordner (rekursiv, inkl. ZIP/RAR/7z) und berechnet pro Datei den exakten RA-Hash — Cartridge in-process, Disc/`.chd` über RAHasher.
> - Gleicht gegen eine lokal gecachte Kopie der RA-Hash-Liste ab. Nach einem einmaligen Sync läuft der Scan komplett offline.
> - Zeigt pro Spiel: Erfolge holbar / andere Version / Disc braucht RAHasher.
> - Dazu: Sammlung mit Diff, „welche Version brauche ich?", Duplikat-Aufräumen, Entdecken (gratis Homebrew mit Sets), Hardcore-Aufholliste, optionales Spielzeit-Tracking, Export nach RetroArch/ES-DE/Playnite/LaunchBox.
>
> Läuft lokal als Web-App oder als Windows-Desktop-App. Open Source (MIT). **Ich bin nicht mit RetroAchievements affiliiert**, es nutzt nur die offene Web-API; **es sind keine ROMs enthalten**.
>
> Es ist noch Beta (v0.9.x) — ich suche Feedback und Tester. Was fehlt euch, was ist unklar?
>
> Repo + Downloads: https://github.com/x3kim/RAChecker

*(Wenn RA einen Channel/Thread für Community-Tools hat, passt dieselbe Kurzfassung auch dort.)*

---

## r/retrogaming  (groß, allgemein — Nutzen in den Vordergrund)

**Titel:**
> Kleines Tool: findet heraus, welche deiner ROMs RetroAchievements-Erfolge unterstützen

**Body:**
> Für alle, die mit RetroAchievements spielen: Erfolge gibt es nur, wenn deine ROM byte-genau der bei RA registrierten Version entspricht. Bei einer größeren Sammlung ist das von Hand nicht machbar.
>
> Mein Tool **RAChecker** scannt den ganzen Ordner und sagt dir pro Spiel, ob es passt — offline (nach einem einmaligen Sync), Open Source, keine ROMs enthalten, nicht mit RA affiliiert.
>
> Screenshots im Post. Noch Beta, Feedback willkommen: https://github.com/x3kim/RAChecker

---

## r/emulation  (streng bei Piraterie — vorsichtig framen)

**Titel:**
> RAChecker — prüft lokal, welche deiner (eigenen) ROMs RetroAchievements-kompatibel sind [Open Source]

**Body:**
> Ein Utility, kein ROM-Anbieter: **RAChecker** liest deine vorhandene ROM-Sammlung, berechnet die RetroAchievements-Hashes und zeigt, welche Dateien Erfolge unterstützen. Es liefert **keine ROMs**, lädt keine herunter und ist nicht mit RetroAchievements affiliiert — es nutzt nur die offene Web-API und die offenen rcheevos-Hash-Regeln.
>
> Läuft komplett lokal (nach einmaligem Sync offline), Windows-Desktop-App oder Web-App, MIT-Lizenz. Beta, suche Feedback: https://github.com/x3kim/RAChecker

---

### Danach
Auf Kommentare antworten (auch kritische) — das bringt mehr Reichweite als der Post selbst.
Wenn jemand einen Bug meldet: als GitHub-Issue festhalten und im Thread verlinken.
