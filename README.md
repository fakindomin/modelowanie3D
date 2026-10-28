# Modelowanie 3D

Prosty edytor 3D w przeglądarce do składania modeli z gotowych elementów i eksportu do druku 3D.
Coś jak Tinkercad, tylko prościej: wybierasz gotowy element z menu, ustawiasz wymiary w milimetrach
i dosuwasz go do innych, a ścianki same się do siebie przyciągają.

## Co potrafi

Dwie zakładki: **Techniczne** (składanie z gotowych elementów) i **Figurki** (żebrowana kolekcja).
Każda ma własną scenę, historię cofania i autozapis.

- **Gotowe elementy w rodzinach:** kafelek dodaje podstawową odmianę, a strzałka obok rozwija
  wszystkie odmiany z rozmiarami S/M/L i ↺ (ostatnio użyte wymiary). Pudełka: prostokątne, okrągłe,
  sześciokątne, z przegródkami, z pokrywką, z pokrywką na zawiasie, z wsuwaną pokrywką. Pokrywki:
  płaska, z rantem, okrągła. Szuflady z obudową. Płyty: pełna, z otworami montażowymi, perforowana.
- **Pokrywka idzie za pudełkiem:** pokrywka dodana do pudełka sama zmienia wymiary razem z nim. Przy
  przegródkach rant dostaje szczeliny, a przy rowkach pokrywka jest wsuwana. Przegródki można obniżyć
  („Przegródki niższe o”). „Odłącz od pudełka” zostawia pokrywkę taką, jaka jest.
- **Układ przegródek:** widok pudełka lub szuflady z góry. Klik w odcinek przegródki usuwa go albo
  przywraca (łączy komory), przeciągnięcie przesuwa przegródkę (komora min. 5 mm). Okrągłe i
  sześciokątne pudełka mają przegródki na krzyż albo promieniowe („tort”) z pierścieniem w środku.
  Przegródki są zawsze przycięte do wnętrza pudełka.
- **Rozbij na płyty:** pudełko albo szufladę można zamienić na dno, ścianki i odcinki przegródek między
  skrzyżowaniami (dalej jedna bryła), żeby zmienić albo usunąć każdą płytę osobno.
- **Zaokrąglenia i fazki:** każdą bryłę można zaokrąglić albo ściąć na pionowych narożnikach oraz na
  górnej i dolnej krawędzi. Pudełko, pokrywka, szuflada i płytka mają też pole „Zaokrąglenie narożników”,
  które zaokrągla także wnętrze (równa ścianka), a pokrywka idzie za tym promieniem.
- **Napisy:** „Napis wypukły” i „Napis wycięty” (grawer) z polskimi literami, cztery kroje (DejaVu),
  wysokość liter, głębokość, pogrubienie kresek, opcjonalna tabliczka. Przyciski „Na którą ściankę”
  stawiają napis na środku wybranej ściany elementu, czytelny z zewnątrz.
- **Podziel na części:** cięcie bryły płaszczyzną (podgląd w modelu) albo „Podziel, żeby zmieściła się
  na stole” (wymiary stołu do ustawienia). W obu częściach powstają otwory na kołki z luzem 0,3 mm, a kołki
  (Ø8, Ø5 albo Ø3, zależnie od grubości) są osobną bryłą. Górne części stają cięciem na stole.
- **Import STL:** „Otwórz” wczytuje też plik STL (binarny albo tekstowy). Model staje się zwykłą bryłą:
  robisz w nim otwory, magnesy, napisy, tniesz go na części. Skala w %, siatka zapisuje się w projekcie.
- **Gięcie:** sekcja „↪ Gięcie” przy płaskiej bryle. „Owiń na rurę” (średnica rury i luz) albo „Zegnij o kąt”
  (kąt, miejsce zgięcia, promień wewnętrzny). Płaska wersja zostaje do edycji, gięcie można wyłączyć.
  „Sprawdź model” ostrzega, gdy gwint albo magnes wypada w strefie gięcia. Gotowe: siodełko, klips i obejma
  dwudzielna na rurę (w „Okuciach”).
- **Własny kształt:** „Własny kształt (obrys)” wyciąga narysowany obrys na wysokość (można zwęzić górę
  i skręcić), „Kształt obrotowy (profil)” obraca połowę przekroju wokół osi (wazon, kubek, gałka).
  Przeciągasz punkty, klik w krawędź dodaje punkt, dwuklik usuwa; są gotowe kształty na start.
  Klik w bok otwiera menu: długość (🔒 trzyma ją przy dalszych zmianach), łuk (wybrzuszenie albo promień),
  podział, poziomo/pionowo. Klik w punkt: kąt między bokami, zaokrąglenie albo fazka narożnika, X/Y.
  Punkty, boki i to samo menu są też w modelu 3D po zaznaczeniu kształtu; wymiary, które się wykluczają,
  świecą na czerwono.
- **Skorupa:** wydrąża całą bryłę ze ścianką o podanej grubości, zamkniętą albo otwartą od góry lub dołu.
- **Lustro i skala:** odbicie (X/Y/Z) i skala całej bryły, liczone na końcu; „Lustrzana kopia” robi parę
  lewy/prawy obok.
- **Część wspólna:** „Rodzaj” → „Część wspólna” przy elemencie albo „∩ Część wspólna z inną bryłą”: zostaje
  tylko to, co bryły mają wspólne.
- **Żebra:** przy kątowniku, ceowniku i teowniku „◣ Dodaj żebra w narożnikach” (powiązane kliny).
- **Wyrównaj i rozłóż:** Ctrl+klik (w modelu albo na liście) zaznacza kilka elementów; panel wyrównuje je
  do krawędzi lub środka i rozkłada równo albo co podany odstęp.
- **Ukryj i zablokuj:** ◉ i 🔓 na liście elementów. Ukryty element nadal jest w wydruku; zablokowanego nie
  przesuniesz ani nie usuniesz.
- **Ułóż na stole:** „⊞ Ułóż” kładzie każdą bryłę na jej największej płaskiej ściance i rozkłada wszystkie
  obok siebie na stole drukarki.
- **Miejsca na magnesy:** jeden przycisk przy pudełku (prostokątnym, okrągłym, sześciokątnym, gotowym albo
  złożonym z płyt) lub pokrywce. W okrągłych i sześciokątnych gniazda idą równo po obwodzie (3/4/6/8).
  Szuflady i obudowa mają opcję „Magnes-zatrzask z tyłu”, który domyka szufladę.
  Silnik robi gniazda (luz 0,2 mm, min. 1,2 mm ścianki), dokłada słupki tam, gdzie ścianka jest za
  cienka, i lustrzane gniazda w pokrywce. Opcje: 4/6/8 magnesów, magnesy ukryte (z wysokością pauzy
  w druku), dodanie płaskiej pokrywki albo z rantem (z wcięciami na słupki). Gniazda ustawione ręcznie
  „Sprawdź model” (i dodanie pokrywki) sprawdza: wysokość, wychodzenie poza materiał, cienką ściankę,
  symetrię, brak gniazd w pokrywce. Proponuje „Popraw wszystkie / Pokaż / Zostaw”.
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
- **Otwory pod złącza:** USB-C, USB-A (też podwójne), micro USB, USB-B, HDMI, micro i mini HDMI, RJ45,
  XT30/60/90, DC 5,5, IEC C14, „ósemka” C8, wyłącznik kołyskowy, jack 3,5, LED 3/5, przyciski 12/16,
  potencjometr, GX12/16, SMA. Każdy ma luz, opcjonalne otwory na śruby, tryb „wtyczka do gniazda na
  płytce” i wzmocnienie (ramka od środka; przy zatrzaskach ścianka jest dookoła pocieniana). Przyciski
  „Na której ściance” przenoszą otwór na przód, tył, boki, górę lub dół bryły. Wymiary są typowe:
  sprawdź swoje złącze suwmiarką.
- **Obudowy Raspberry Pi:** Pi 5, 4B, 3B+, Zero 2 W i Pico. Pudełko, słupki z otworami pod wkręty,
  otwory na gniazda, szczelina na kartę microSD i pokrywka z rantem, wszystko jako zwykłe elementy do edycji.
- **Wybieranie:** lista wszystkich elementów pogrupowanych w bryły, podświetlenie elementu pod kursorem
  (jednocześnie w modelu i na liście). Otwór schowany w bryle wybiera się pierwszym kliknięciem,
  a ponowne kliknięcie w to samo miejsce wybiera to, co leży pod nim.
- **Grupy:** „Złącz otwory z bryłą” pokazuje gotowy, wycięty element. Otwory dalej można klikać
  i przesuwać, a całą grupę przesuwać, obracać i duplikować. „Rozdziel” cofa złączenie.
- **Szyki i kopie:** w rzędzie, po okręgu, w narożnikach bryły, lustro X, Y albo X i Y. Kopie są powiązane
  (zmiana wymiarów jednej zmienia wszystkie) i pamiętają regułę: przesuń jedną, a reszta przesunie się
  symetrycznie. „Odłącz” pozwala zmienić jedną.
- **Wymiary (W):** najechanie pokazuje wymiary ścianki, długość krawędzi, średnicę okręgu, otworu
  albo walca. Kliknięcie przypina wymiar, a drugie kliknięcie mierzy odległość. Jeśli wymiar jest
  parametrem elementu, można go zmienić od razu w okienku pomiaru.
- **Faktura powierzchni** jako prawdziwa geometria: żeberka, rowki, radełko, kropki, plaster miodu,
  na wybranej ściance albo dookoła walca, wypukła lub wycięta.
- **Sprawdź model:** nachodzące na siebie bryły, ścianki cieńsze niż ustawione minimum (domyślnie
  0,8 mm), otwory, które nic nie wycinają, bryły pod stołem lub za duże na stół.
- **Figurki:** 16 modeli z żebrowanej kolekcji (silnik przeniesiony z artefaktu, STANDARD v1.0),
  suwaki zmieniają wszystkie części figurki naraz, „Całość na 150 mm”. Do figurek można dodawać
  narzędzia techniczne: magnesy, otwory, czopy, gwinty.
- **Składanie:** przeciąganie myszką, kładzenie elementu na tym, co jest pod nim (w pudełku na dnie,
  nie na krawędzi), przyciąganie do prawdziwych ścianek, także wewnętrznych (dno, ścianki, narożniki
  w środku pudełka), obrót o 90°, strzałki z osiami do podnoszenia. Strzałka pod kursorem ma
  pierwszeństwo przed elementem za nią. Element postawiony w innej bryle (np. kolumna w pudełku)
  sam do niej dołącza, a postawiony w rogu bryły dostaje propozycję „Skopiować do pozostałych 3 narożników?”.
- **Opisy ⓘ:** przy sekcjach i przyciskach panelu; najechanie albo stuknięcie pokazuje, co robi funkcja.
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
