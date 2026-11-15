# Pudełko na akcesoria – moduł parametryczny

Stan: projekt (bez kodu modułu). Wzorzec geometrii: `tools/pudelko/pudelko.py` (v11, Python/manifold3d) – służy do porównań (bbox/objętość przy wartościach domyślnych).
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
- Jedna szuflada: ustawiana dowolnie (szerokość i strona lewo/prawo), reszta miejsca lita. (Interpretacja do potwierdzenia.)
- Zero szuflad: wysokość = minimum potrzebne na młynek i bibułki, z możliwością zmiany w zakresie (suwak od minimum).
- Wysokość szuflady jeden suwak (domyślnie 13,2 mm przy H = 56,1); wyższa szuflada podnosi H o tyle samo.
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
