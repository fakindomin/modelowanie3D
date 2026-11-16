# Świąteczne modele w Figurkach (etykieta „Dla”, czubek choinkowy, foremka do piernika, taca)

Źródło prawdy: skrypty Pythona z repozytorium linia-3d (`etykieta.py`, `czubek_choinkowy.py`, `foremki_piernik.py`, `taca.py`). Tu jest ich port do Manifold: `src/figurines/swieta.ts`. Modele pomijają silnik Figurek (pola odległości) i budują bryły wprost w układzie edytora (Z w górę, środek w XY, spód na z = 0), a `src/parts/figurine.ts` opakowuje je jak pozostałe figurki. Kategoria w menu: „Święta: etykieta, czubek, foremki, taca”.
Cel druku: Bambu Lab P1S, dysza 0,4, PETG, bez podpór.

## Etykieta „Dla”
- Płytka 2,0 mm + wypukły napis 0,8 mm, otwór Ø 4,2 na sznurek. Napis „Dla” i pod nim wpisane imię (krój Poppins Bold, podzbiór glifów w `src/parts/fonts/poppins-bold.json`, polskie znaki są).
- Szerokość płytki dopasowuje się do imienia; suwak „Wysokość liter imienia”.
- Nazwa części i pliku: „Dla <imię>”.

## Czubek choinkowy
- Żebrowany profil obrotowy: tuleja → stożek 49° → kula → szyjka → iglica.
- Suwaki: średnica czubka choinki (otwór ma 0,6 mm luzu), długość tulei 30–80 mm, wysokość całkowita, średnica kuli; „Dokładność siatki” (szkic / normalna).
- Kula jest pusta i otwarta od dołu. Ściana wnęki to zewnętrzny profil przesunięty o 2,7 mm po normalnej, zakończony stożkiem 52° i płaskim sufitem Ø 10 (jedyny nawis, 78,5 mm²). Uwaga pod nazwą podaje, na ile mm od dołu wchodzi czubek choinki.
- Minima kuli i wysokości liczone na żywo z średnicy i tulei (`topperMin`, `fixTopper`), żeby ściana miała zawsze miejsce.
- Druk stojąco, tuleją na stole, brim ok. 8 mm. Na 0,4 mm model ma ok. 240 tys. trójkątów (STL ok. 12 MB); „Szkic” zmniejsza to co najmniej dwukrotnie.

## Foremka do piernika
- Pięć kształtów (choinka, renifer, bałwan, piernikowy ludzik, gwiazdka), skala ciasta 0,7–1,3.
- Ścianka 1,2 mm, ostrze zwężone do 0,45 mm w 8 stopniach, wysokość 16 mm.
- Kołnierz (brim) na stałe od strony dociskania: szerokość 3–10 mm (domyślnie 5), grubość 1,6–4 mm (domyślnie 2). Druk kołnierzem do stołu, ostrzem do góry.
- Uwaga w programie: wydruk FDM nie jest trwale bezpieczny dla żywności.

## Taca żebrowana
- Taca prostokątna z zaokrąglonymi narożnikami na renifery kręgle i drobiazgi, żebrowana jak reszta linii. Żebra (amplituda 0,8 mm, rozstaw 3,4 mm) biegną po linii środkowej prostokąta, a liczba żeber jest podzielna przez 4, więc grzbiet wypada w środkach czterech boków i wymiar zewnętrzny jest dokładnie taki, jak na suwaku.
- Suwaki: długość 100–250 mm (domyślnie 240), szerokość 40–150 mm (75), wysokość 10–40 mm (20), promień narożników 2–60 mm (15). Promień liczy się po grzbietach żeber i jest ograniczany do połowy mniejszego wymiaru; połowa szerokości daje całkiem okrągłe końce („tabletka”). Dno 2,4 mm i ścianka 2,0 mm od linii środkowej żeber (w dolinie żebra 1,2 mm) są stałe.
- Ścianki są pionowe, dolna krawędź ma fazkę w dwóch schodkach (0,2 mm / 0,3 i 0,4 mm / 0,15), więc nic nie wisi: druk dnem do stołu, bez podpór.
- Uwagi pod nazwą: wymiar, promień narożników, liczba żeber, pojemność wnęki i masa; ile reniferów kręgli (brzuch Ø 54,6 mm; na rancie z żebrami Ø 43,7 mm przy wysokości 20 mm) mieści się w rzędzie z luzem min. 0,5 mm; ile tac mieści się naraz na stole P1S 256 × 256 mm (odstęp 8 mm); ostrzeżenie, gdy ścianka w dolinie żebra < 0,8 mm albo taca nie mieści się na stole lub renifer się nie zmieści.
- Domyślna taca 240 × 75 × 20 mm, R 15: 176 żeber, ok. 62 cm³ = 79 g PETG, wnęka 284 ml, 4 renifery kręgle co 58 mm z luzem 8,4 mm, 3 tace na stole P1S.
- Nazwa części i pliku: „Taca 240x75x20”.

## Przekrój
Przycisk „◧ Przekrój” (na telefonie w menu ⋮) ustawia płaszczyznę tnącą przez środek sceny (`localClippingEnabled`, tylko materiały podglądu). Nie zmienia brył ani eksportu.

## Sprawdzanie zgodności z Pythonem
```
python3 tools/swieta/make_ref.py /ścieżka/do/linia-3d > tools/swieta/ref.json   # odtwarza wartości wzorcowe
sh scripts/check/swieta.sh           # port TS vs ref.json (objętość, wymiary, status Manifold, nawisy)
```
Test interfejsu w przeglądarce: `python3 scripts/check/swieta_ui.py` (Playwright, po `npm run build` i `python3 -m http.server` w `dist`).

Tolerancje objętości: etykieta i czubek 0,3 %, foremka 0,6 %, taca 0,5 % (osiem wariantów wymiarów i promienia narożników; poza tym wymiary po grzbietach, nawisy < 1 mm², zgodność liczby mieszczących się reniferów z Pythonem). Test dodatkowo sprawdza siatkę skrajnych suwaków czubka (81 kombinacji) i tacy (81 kombinacji), polskie znaki w imieniu, puste imię i ograniczenie wysokości do stołu P1S.
