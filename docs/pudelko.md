# Pudełko na akcesoria – moduł parametryczny

Stan: punkty 1–2 gotowe (korpus + pokrywa-tacka + napis jako `PartDef` w `src/parts/pudelko.ts`, parametry wnętrza, skos pod zapalniczką, kontrole `notes`); szuflady nadal jak w v11 (punkt 3). Wzorzec geometrii: `tools/pudelko/pudelko.py` (v11, Python/manifold3d) – służy do porównań (bbox/objętość przy wartościach domyślnych).
Docelowo: `PartDef` `pudelko` w `src/parts/` (kategoria `useful`), części przez `pieces`: korpus, pokrywa, napis, szuflada. Jądro: `manifold-3d` (to samo co w Pythonie).
Cel druku: Bambu Lab P1S (AMS), bez podpór wewnątrz, pokrywa górą do stołu.

## Pokrywa = tacka
- Grubość 2,8 → 3,8 mm (H 56,1 → 57,1, reszta bez zmian; kąt jaskółczego ogona 34° → ~27°).
- Płynne płytkie wgłębienie na DOLNEJ ściance (smoothstep): głębokość 2,0, szerokość skosu ~18 mm z każdej strony, nachylenie max ~10°, ~135×61 mm, bez rynny, bez pionowych ścianek, 3 mm odstępu od gniazd magnesów.
- Garby (6 walców) usunięte; górna ścianka płaska (faktura z blachy). Żebra pokrywy (x=0) i 4 gniazda magnesów zostają.
- Napis FKNDMN = wkładka w innym kolorze, równo z powierzchnią (głębokość 0,8, suwak 0,4–1,6). Eksport: pokrywa z wybraniami + osobna część napisu, te same współrzędne (import wieloczęściowy w Bambu Studio).

## Wnętrze (parametry)
- Młynek: Ø i H (Ø → X i Y; H → wysokość pudełka H = DR_Z1 + materiał pod gniazdem + H młynka + luz + 3,3).
- Bibułki: L / T / H / BOOK_IN (T → Y; H konkuruje z wysokością szuflady).
- Zapalniczka: L / W / T (L → X).
- Skos dna zapalniczki: lewy / prawy / wył. (domyślnie prawy), długość 25, głębokość 2,0, podniesienie ≈ d·(L−Lr)/Lr ≈ 4,6 mm. Kontrole: podniesienie ≥ 3 mm, nachylenie 3–10°, ≥ 2 mm materiału pod spodem. Wolna przestrzeń pod zapalniczką – na razie pomijamy.

## Szuflady
- Liczba: 0 / 1 / 2, zawsze identyczne; ustawia się wymiary jednej, druga jest kopią.
- Jedna szuflada: ustawiana dowolnie (wymiary jak niżej, położenie płynnie), reszta miejsca lita.
- Zero szuflad: wysokość = minimum potrzebne na młynek i bibułki, z możliwością zmiany w zakresie (suwak od minimum).
- Wysokość szuflady jeden suwak (domyślnie 13,2 mm przy H = 56,1); wyższa szuflada podnosi H o tyle samo.

### Wymiary i położenie szuflady (suwaki)
- Szerokość, wysokość i długość: osobne suwaki (nie tylko szerokość). Wysokość nadal podnosi/obniża H pudełka; długość ograniczona głębokością pudełka (Y) minus ścianki.
- Położenie: płynny suwak przesunięcia w X (nie tylko lewo/prawo) w obrębie strefy szuflad; dla dwóch szuflad przesuwa się cały zestaw, przegroda zostaje między nimi.
- Skalowanie względem magnesów: minima suwaków wynikają z rozmiaru magnesu (domyślnie 5×2, luz 0,25; gniazdo Ø+luz, głębokość MAG_T+0,2, kryjąca ścianka 0,8; MAG_WALL 1,2 z `src/geom/magnets.ts`) i są liczone na żywo, nie stałe:
  - wysokość ≥ (Ø+luz) + 2·MAG_WALL (poziomy magnes w tylnym rogu mieści się w ściance),
  - długość ≥ skos przód + skos tył + miejsce na tylny magnes; skosy skalują się w dół (max 1/3 długości), nie wychodzą poza szufladę,
  - szerokość ≥ miejsce na ściankę boczną z gniazdem (MAG_T+0,2+0,8 = 3,0 mm) po obu stronach + minimum użytkowe,
  - odstęp od zewnętrznej ściany i od przegrody ≥ 3,0 mm przy magnesach (1,6 mm bez nich); położenie X obcinane do tego zakresu.
- Magnesy „brak” zdejmuje te ograniczenia (minima spadają do technologicznych); zmiana rozmiaru magnesu przelicza wszystkie minima.
- Magnes nigdy nie może wystawać: kontrola błędu (czerwona), gdyby jakaś kombinacja (np. ręcznie wpisana wartość z JSON) naruszała minimum – wtedy wartość jest przycinana i podświetlona.
- Dół otwarty (brak podłogi pod szufladami), mini prowadnice (ząb 1,5 mm, spód 45°) w rowkach boków szuflady; dno szuflady równo z dołem pudełka → druk bez podpór; +3 mm wysokości wnętrza. Sufity wnęk (~73×71) z podłoża lub mostkowane (ostrzeżenie > 60 mm).
- Płynne skosy dna z przodu i z tyłu szuflady (25 × 3 mm jak w tacce, przełączane); magnesy ukryte w tylnym skosie.
- Magnesy: przełącznik są/brak (na szufladę). Poziomy magnes w tylnym rogu ścianki szuflady; ścianki wnęki: para tylna (zamknięcie) + przednia (zatrzymanie przy wysunięciu ~56 mm). Magnesy w zewnętrznych ściankach opcjonalnie (domyślnie wył.).
- Przegroda między szufladami: grubość automatyczna = (MAG_T+0,2)+0,8 = 3,0 mm dla 5×2 (gniazda przesunięte w Y o ≥ Ø+luz+1,5 ≈ 7 mm), 1,6 mm bez magnesów. X bez zmian (przegroda zabiera szerokość szuflad: 72,8 → 72,1).
- Ogranicznik wysunięcia: opcjonalna wypustka 0,6 mm na prowadnicy (domyślnie wył.).
- Znaczek „f” na dnie szuflady: `src/lite/mark.ts` (f z `znak-f.svg`), rozmiar suwakiem (domyślnie 10 mm), tryb: wkładka kolorowa / wgłębiony / brak.

## Faktury
- Z `src/geom/texture.ts` (żebra, rowki, radełko, kropki, plaster miodu), osobno: boki, góra pokrywy, fronty szuflad; domyślnie żebra japandi.
- Górna ścianka pokrywy (druk górą do stołu): tylko faktura wycięta, nie wypukła.

## Do zrobienia później
- Dół całego pudełka (do zmiany), opcjonalnie napis na dnie korpusu jako wkładka.
- Kolejność prac: (1) korpus + pokrywa z domyślnymi wartościami i test zgodności z `pudelko.py`, (2) parametry wnętrza, (3) szuflady, (4) faktury i „f”, (5) kontrole i eksport 3MF.

## Test zgodności (punkt 1)
`sh scripts/check/pudelko.sh` buduje korpus i pokrywę z parametrami „legacy” (pokrywa 2,8, bez tacki, garby, napis grawerowany) i porównuje z `tools/pudelko/ref.json` (wynik `pudelko.py` v11): bbox identyczny, objętość korpusu −0,04%, pokrywy 0,00%. Dla wartości domyślnych sprawdza też: Z_CH0 bez zmian (H = 57,1), brak kolizji korpus/pokrywa, wkładka napisu nie nachodzi na pokrywę.

## Punkt 2: parametry wnętrza (gotowe)
- Suwaki: młynek Ø/H, bibułki L/T/H/część w szczelinie, zapalniczka L/W/T, skos dna (prawy/lewy/wył., długość 25, głębokość 2,0). Domyślne = v11 (test zgodności nadal przechodzi, skos wyłączony w „legacy”).
- Zależności: Ø młynka → Y i X; H młynka → H pudełka (H = 11,8 + 2 + 1 + (H młynka + 5) + 0,3 + pokrywa + 0,2); grubość bibułek → Y; L zapalniczki → X; wysokość bibułek zmienia wysoką szufladę.
- Skos: dno opada liniowo ku wybranemu końcowi; wciśnięty koniec unosi drugi o d·(L−Lr)/Lr (domyślnie 4,6 mm, nachylenie 4,6°).
- Kontrole w panelu części (`PartDef.notes`, `src/ui/Panels.tsx`): wymiary zewnętrzne i co je wyznacza, wysokości szuflad (błąd < 8,25 mm), materiał pod zapalniczką/skosem (uwaga < 2, błąd < 1,2 mm), nachylenie skosu 3–10°, uniesienie ≥ 3 mm, minimalna głębokość pudełka na ubijak.
- Tymczasowo: odstęp magnesów szuflad jest przycinany do szerokości kieszeni, a magnesy pokrywy do głębokości pudełka; pełna logika magnesów w punkcie 3.
- Ubijak i okno pod palec mają nadal stałe wymiary v11.

## Zasada: suwaki nie dopuszczają stanów z uwagą ani błędem
- `PartDef.paramsFor` (`dynamicParams` w `src/parts/pudelko.ts`) liczy dla każdego suwaka zakres na żywo: od bieżącej wartości w obie strony, dopóki wszystkie reguły z `pudelkoNotes` są spełnione (szuflady, skos, materiał pod zapalniczką, ubijak, tacka i napis). Przy zawężeniu w podpowiedzi pola jest zdanie o przyczynie.
- `PartDef.normalize` (`repairParams`) koryguje wartości spoza reguł (wklejony JSON, włączenie skosu) do najbliższego dozwolonego stanu.
- Czerwone/żółte kontrole zostają tylko jako zabezpieczenie dla danych spoza suwaków. Test: 400 losowych przeciągnięć suwaków z wartości domyślnych nie daje ani jednej uwagi (`scripts/check/pudelko.sh`).
- Każda nowa reguła (np. magnesy szuflady w punkcie 3) trafia do `pudelkoNotes`, więc zakresy suwaków uwzględnią ją automatycznie.
- Progi: wysoka szuflada ≥ 10 mm, materiał nad szufladą ≥ 2 mm, skos 3–10° i uniesienie ≥ 3 mm, tacka max 10° i ≥ 1,2 mm pod nią (≥ 0,8 mm do napisu).

## Ułożenie w edytorze i do druku
- `build()` zwraca części w złożeniu (korpus, pokrywa zasunięta, napis w jej wybraniu); wspólny układ współrzędnych, każda część w swoim kolorze.
- Suwak „Pokrywa: wysunięcie (podgląd)” 0–100 % przesuwa pokrywę i napis w −X (kanał otwarty z lewej), 100 % = zaparkowana na magnesach jak w v11. Nie zmienia wydruku.
- Pozycja do druku: `PartDef.printTurn` (nowe pole, `src/parts/def.ts`, użyte w `printBodies` w `src/App.tsx`): pokrywa i napis obracają się o 180° wokół X (górą do stołu; nawisy 6406 → 144 mm²). Automatyczny `bestPose` układał pokrywę pionowo na krótkim brzegu, więc dla pudełka jest pomijany (`pudelko` w `KEEP` w `src/geom/orient.ts`).
- Napis dołącza do pokrywy w eksporcie: `PieceDef.printWith` (`src/parts/def.ts`) + `groupPrintWith` (`src/export.ts`, wywołane w `printBodies` w `src/App.tsx`) robią z pokrywy i wkładki jeden obiekt 3MF z dwiema częściami (`ColoredBody.parts`) we wspólnych współrzędnych; w slicerze każda część dostaje własny filament. Test: `scripts/check/pudelko.sh`.
- Szuflady są osobną częścią `szuflady` (do dwóch brył w jednej części), w złożeniu dnem równo z dołem pudełka; w druku leżą dnem do stołu.

## Punkt 3: szuflady (gotowe)
Kod: `drawerPlan`, `drawers`, `bayMagnetCuts`, `bayRails`, `rampSolid` w `src/parts/pudelko.ts`; v11 zostaje pod ukrytym `legacyDrawers` (test zgodności).
- Parametry (grupa „Szuflady”): `nDr` 0/1/2, `dW` (71,1), `dH` (12,8), `dL` (70), `dX` położenie płynne, `dMag` tak/nie, `dRampH`/`dRampL` skos dna (przód i tył, łagodny), `baseExtra` (tylko przy 0 szufladach). Przy dwóch szufladach obie są identyczne; przy jednej jest dowolna.
- Wnęki otwarte od dołu (bez podłogi), w ściankach wnęk prowadnice 1,5 mm: górna ścianka pozioma, spód 45° (druk bez podpór). Szuflada ma rowki z luzem 0,25 mm, przegroda między wnękami 3,0 mm z magnesami 5×2 i 1,6 mm bez nich.
- Magnesy: w ściankach bocznych wnęki i szuflady, tył (zamknięta) i przód (wysunięta o dł. − 21,5 mm); lewa i prawa ścianka mają inne Y (odstęp w przegrodzie). Gniazdo 2,2 mm w ściance 2,8 mm, oś nad prowadnicą (z = 7,6, pasmo 5,0–10,25), więc magnes nie wystaje.
- Progi (wszystkie w `pudelkoNotes`, więc suwaki same się zawężają): wysokość ≥ 11,3 mm z magnesami (8,0 bez), długość ≥ 41,5 mm z magnesami (30 bez; 20 mm wysuwu) i ≤ Y − 3,4, szerokość ≥ 30 i łącznie ≤ dostępne miejsce, położenie ≤ wolne miejsce, skos ≤ wysokość − 1,2 − 5 oraz ≤ ½ wnętrza, ≥ 1,6 mm materiału pod bibułkami nad wnęką, ≥ 1,2 mm pod zapalniczką.
- Wysokość pudełka wynika z wysokości szuflady (dno młynka = dH + 7). Bez szuflad dno ma minimum dla młynka, bibułek, zapalniczki ze skosem i ubijaka (+ `baseExtra`); dół jest wtedy zamknięty z napisem.
- Zmiana liczby szuflad albo magnesów: `repairParams` sam dopasowuje szerokość, wysokość, długość, położenie i skos.
- Napis na dole pudełka wraca przy przeróbce dołu (przy szufladach dół jest otwarty).
- Test: `scripts/check/pudelko.sh` (kolizje szuflad z korpusem i pokrywą, objętość kieszeni magnesów = pełna, mała szuflada, 0/1/2 szuflady, 400 losowych kroków z geometrią co 10 kroków).
