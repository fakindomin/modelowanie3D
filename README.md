# Modelowanie 3D

Prosty edytor 3D w przeglądarce do składania modeli z gotowych elementów i eksportu do druku 3D.
Coś jak Tinkercad, tylko prościej: wybierasz gotowy element z menu, ustawiasz wymiary w milimetrach
i dosuwasz go do innych, a ścianki same się do siebie przyciągają.

## Co potrafi

Dwie zakładki: **Techniczne** (składanie z gotowych elementów) i **Figurki** (żebrowana kolekcja).
Każda ma własną scenę, historię cofania i autozapis.

- **Gotowe elementy:** płyta (szerokość × głębokość × grubość), pudełko z przegródkami, pokrywka,
  szuflada, obudowa na szuflady, płytka montażowa.
- **Profile:** płaskownik, kątownik, teownik, ceownik, profil zamknięty, rura, pręt.
- **Bryły podstawowe:** prostopadłościan, walec, stożek, klin, kula.
- **Otwory i połączenia:** otwór okrągły i prostokątny, czop okrągły i kwadratowy, gniazdo magnesu,
  otwór pod insert, otwór na śrubę z pogłębieniem, gniazdo nakrętki. Wszystkie z ustawianym luzem.
- **Gwinty i śruby:** otwór z drukowanym gwintem (M6–M30, drobnozwojne, PG, rurowe G, własny skok),
  śruba / pręt gwintowany / króciec, nakrętka, otwór pod wkręcenie M2–M5. Przyciski „Dodaj pasującą
  śrubę / nakrętkę / otwór z gwintem” dobierają drugą część z luzem.
- **Zawiasy i łączniki:** zawias z bolcem, zawias print-in-place, zatrzask (haczyk + okienko),
  jaskółczy ogon z gniazdem. Zawias zaznaczony na pudełku sam łączy skrzydełka z pudełkiem i pokrywą.
- **Przepusty i złączki:** dławik kablowy dobierany do średnicy kabla (otwór, korpus, nakrętka
  kontrująca, nakrętka dociskowa, uszczelka z TPU), przepust na wtyczkę (keyhole), odciążka kabla,
  karbowana końcówka na wąż 1/2", 5/8", 3/4" z gwintem G, rowek na o-ring.
- **Wybieranie:** lista wszystkich elementów pogrupowanych w bryły, podświetlenie elementu pod kursorem
  (jednocześnie w modelu i na liście). Otwór schowany w bryle wybiera się pierwszym kliknięciem,
  a ponowne kliknięcie w to samo miejsce wybiera to, co leży pod nim.
- **Grupy:** „Złącz otwory z bryłą” pokazuje gotowy, wycięty element. Otwory dalej można klikać
  i przesuwać, a całą grupę przesuwać, obracać i duplikować. „Rozdziel” cofa złączenie.
- **Szyki i kopie:** w rzędzie, po okręgu, w narożnikach bryły, lustro. Kopie są powiązane (zmiana
  wymiarów jednej zmienia wszystkie), „Odłącz” pozwala zmienić jedną.
- **Faktura powierzchni** jako prawdziwa geometria: żeberka, rowki, radełko, kropki, plaster miodu,
  na wybranej ściance albo dookoła walca, wypukła lub wycięta.
- **Sprawdź model:** nachodzące na siebie bryły, ścianki cieńsze niż ustawione minimum (domyślnie
  0,8 mm), otwory, które nic nie wycinają, bryły pod stołem lub za duże na stół.
- **Figurki:** 16 modeli z żebrowanej kolekcji (silnik przeniesiony z artefaktu, STANDARD v1.0),
  suwaki zmieniają wszystkie części figurki naraz, „Całość na 150 mm”. Do figurek można dodawać
  narzędzia techniczne: magnesy, otwory, czopy, gwinty.
- **Składanie:** przeciąganie myszką, kładzenie elementu na tym, co jest pod nim, przyciąganie
  ścianek i krawędzi do sąsiadów, obrót o 90°, strzałki z osiami do podnoszenia.
- **Bryły do druku:** każdy element należy do bryły. Elementy jednej bryły są sklejane w jeden wydruk,
  a jej otwory wycinają tylko ją. Dzięki temu czop zostaje na jednej części, a gniazdo powstaje w drugiej.
- **Eksport:** STL (wszystko w jednym pliku) i 3MF (każda bryła jako osobny obiekt).
- Zapis i wczytywanie projektu (JSON z obiema zakładkami), autozapis w przeglądarce, cofnij/ponów.

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
