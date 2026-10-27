# Modelowanie 3D

Prosty edytor 3D w przeglądarce do składania modeli z gotowych elementów i eksportu do druku 3D.
Coś jak Tinkercad, tylko prościej: wybierasz gotowy element z menu, ustawiasz wymiary w milimetrach
i dosuwasz go do innych, a ścianki same się do siebie przyciągają.

## Co potrafi

- **Gotowe elementy:** pudełko (z przegródkami), pokrywka, szuflada, obudowa na szuflady, płytka montażowa.
- **Profile:** płaskownik, kątownik, teownik, ceownik, profil zamknięty, rura, pręt.
- **Bryły podstawowe:** prostopadłościan, walec, stożek, klin, kula.
- **Otwory i połączenia:** otwór okrągły i prostokątny, czop okrągły i kwadratowy, gniazdo magnesu,
  otwór pod insert, otwór na śrubę z pogłębieniem, gniazdo nakrętki. Wszystkie z ustawianym luzem.
- **Pomocnicy:** „Dodaj pasujące gniazdo” przy czopie, „Dodaj dopasowane szuflady” przy obudowie,
  „Dodaj pasującą pokrywkę” przy pudełku.
- **Składanie:** przeciąganie myszką, kładzenie elementu na tym, co jest pod nim, przyciąganie
  ścianek i krawędzi do sąsiadów, obrót o 90°, strzałki z osiami do podnoszenia.
- **Bryły do druku:** każdy element należy do bryły. Elementy jednej bryły są sklejane w jeden wydruk,
  a jej otwory wycinają tylko ją. Dzięki temu czop zostaje na jednej części, a gniazdo powstaje w drugiej.
- **Eksport:** STL (wszystko w jednym pliku) i 3MF (każda bryła jako osobny obiekt).
- Zapis i wczytywanie projektu (JSON), autozapis w przeglądarce, cofnij/ponów.

## Uruchomienie

```bash
npm install
npm run dev        # serwer deweloperski
npm run build      # wersja produkcyjna w dist/
npx vite build --mode single   # jeden samodzielny plik dist-single/index.html
```

Po scaleniu do `main` workflow `.github/workflows/pages.yml` publikuje aplikację na GitHub Pages
(w ustawieniach repozytorium: Settings → Pages → Source: **GitHub Actions**).

## Technologia

TypeScript, React, Vite, Three.js (React Three Fiber) i [Manifold](https://github.com/elalish/manifold)
(WASM) do operacji bryłowych, dzięki czemu eksportowane modele są szczelne i gotowe do slicera.
