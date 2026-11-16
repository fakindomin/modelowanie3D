# Świąteczne modele w Figurkach (etykieta „Dla”, czubek choinkowy, foremka do piernika)

Źródło prawdy: skrypty Pythona z repozytorium linia-3d (`etykieta.py`, `czubek_choinkowy.py`, `foremki_piernik.py`). Tu jest ich port do Manifold: `src/figurines/swieta.ts`. Modele pomijają silnik Figurek (pola odległości) i budują bryły wprost w układzie edytora (Z w górę, środek w XY, spód na z = 0), a `src/parts/figurine.ts` opakowuje je jak pozostałe figurki. Kategoria w menu: „Święta: etykieta, czubek, foremki”.
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

## Przekrój
Przycisk „◧ Przekrój” (na telefonie w menu ⋮) ustawia płaszczyznę tnącą przez środek sceny (`localClippingEnabled`, tylko materiały podglądu). Nie zmienia brył ani eksportu.

## Sprawdzanie zgodności z Pythonem
```
python3 tools/swieta/make_ref.py /ścieżka/do/linia-3d > tools/swieta/ref.json   # odtwarza wartości wzorcowe
sh scripts/check/swieta.sh           # port TS vs ref.json (objętość, wymiary, status Manifold, nawisy)
```
Test interfejsu w przeglądarce: `python3 scripts/check/swieta_ui.py` (Playwright, po `npm run build` i `python3 -m http.server` w `dist`).

Tolerancje objętości: etykieta i czubek 0,3 %, foremka 0,6 %. Test dodatkowo sprawdza siatkę skrajnych suwaków czubka (81 kombinacji), polskie znaki w imieniu, puste imię i ograniczenie wysokości do stołu P1S.
