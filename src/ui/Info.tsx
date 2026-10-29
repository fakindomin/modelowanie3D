import { useState } from 'react';

/** Short explanations of what each tool does, shown by the ⓘ marks. */
export const INFO = {
  jar: 'Słoik: górna część ścianki staje się gwintowaną szyjką (cofniętą tak, że zakręcona pokrywka jest równo z pudełkiem). Pokrywka ma gwint wewnętrzny i miejsce na płaską uszczelkę, którą zakręcenie ściska o 0,3 mm. Uszczelkę drukuj z TPU albo wytnij z gumy. Szyjkę i pokrywkę drukuj bez podpór; pokrywkę wierzchem do stołu.',
  wrapText: 'Zawija napis na walec o podanej średnicy, litery na zewnątrz (np. etykieta na kubek albo skala na pokrętle). Średnicę zmienisz w sekcji Gięcie. Bierze średnicę największego walca, rury lub pręta w modelu.',
  dims: 'Wymiary tego elementu w milimetrach. Strzałki ↑↓ w polu zmieniają o krok, z Shiftem o 10 kroków.',
  position: 'Położenie środka elementu (X, Y) i jego spodu (Z) w mm. Element postawiony w innej bryle sam do niej dołącza.',
  rotation: 'Obrót wokół osi X, Y, Z w stopniach. Przyciski obracają o 90° i zostawiają element na tej samej wysokości.',
  pattern: 'Robi powiązane kopie: zmiana wymiarów jednej zmienia wszystkie, a przesunięcie jednej przesuwa resztę według szyku. „Odłącz” wyłącza kopię z szyku.',
  magnets: 'Robi gniazda na magnesy na górnej krawędzi ścianek pudełka. Gdzie ścianka jest za cienka, dokłada słupek; w pokrywce robi lustrzane gniazda.',
  bend: 'Gnie całą bryłę razem z otworami i napisami. „Owiń na rurę” zwija długość wokół rury o podanej średnicy, „Zegnij o kąt” zagina od wybranej linii z promieniem gięcia. Wymiary edytujesz na płasko (zaznacz „Pokaż płasko”), gięcie liczy się na końcu. Drukujesz już wygiętą bryłę.',
  shell: 'Wydrąża całą bryłę: zostają ścianki o podanej grubości. „Otwarta od góry” robi z klocka pojemnik. Oszczędza materiał i czas druku. Wymiary zmieniasz na pełnej bryle, wydrążenie liczy się na końcu.',
  xform: 'Odbija i skaluje całą bryłę względem środka jej podstawy. Lustrzana kopia przydaje się do par: lewy i prawy uchwyt. Skala zmienia też otwory, więc otwory na śruby i gwinty wyjdą inne niż w opisie.',
  clip: 'Zostawia tylko to, co obie bryły mają wspólne (przecięcie). Np. kula ∩ sześcian daje zaokrąglony klocek, a walec ∩ walec obok siebie soczewkę.',
  ribs: 'Trójkątne żebra (wsporniki) w wewnętrznych narożnikach profilu: kątownik przestaje się rozginać. Żebra są powiązane, więc grubość i wielkość zmieniasz w jednym. Pojedyncze żebro to „Klin” w bryłach podstawowych.',
  align: 'Ctrl+klik (w modelu albo na liście) zaznacza kilka elementów. „Wyrównaj” ustawia je do wspólnej krawędzi albo środka, „Rozłóż” daje równe odstępy.',
  split: 'Tnie całą bryłę płaszczyzną na dwie osobne bryły (pomarańczowa płaszczyzna w modelu). Kołki: w obu częściach powstają otwory z luzem 0,3 mm, a kołki są osobną bryłą do wydruku. „Podziel, żeby zmieściła się na stole” sam dobiera równe cięcia. Części możesz potem dalej zmieniać.',
  edges: 'Zaokrągla albo ścina zewnętrzne krawędzie: narożniki widziane z góry oraz brzeg górnej i dolnej ściany. Wewnętrzne krawędzie (wnętrze pudełka) zostają ostre. Zaokrąglenie góry i dołu jest liczone warstwami po 0,2 mm, jak przy druku.',
  texture: 'Wzór na wybranej ściance jako prawdziwa geometria (żeberka, rowki, radełko, kropki, plaster miodu): wypukły albo wycięty.',
  print: 'Bryła = osobny wydruk. Elementy jednej bryły sklejają się, a otwory wycinają tylko swoją bryłę.',
  hole: '„Otwór” wycina materiał z bryły, do której należy; „Bryła” to materiał.',
  body: 'Do której bryły należy element. Zwykle dobiera się sama: element postawiony w pudełku dołącza do jego bryły.',
  group: 'Cała bryła: wszystkie elementy, które drukują się razem. Przesuwasz, obracasz i duplikujesz je naraz.',
  matchHole: 'Robi gniazdo o tym samym kształcie z luzem 0,3 mm, wycinane w części, na której stanie czop.',
  drawers: 'Dodaje szuflady dopasowane do każdego otworu obudowy, z luzem 0,3 mm.',
  lid: 'Dodaje pokrywkę o wymiarach pudełka obok niego. Jeśli pudełko ma gniazda na magnesy, sprawdzi je i zaproponuje lustrzane w pokrywce.',
  dividers: 'Widok pudełka z góry. Klik w odcinek przegródki usuwa go (dwie komory łączą się w jedną) albo przywraca. Przeciągnięcie przesuwa całą przegródkę, więc komory mogą być różnej wielkości. Przegródki zawsze kończą się na ściankach pudełka, a pasująca pokrywka sama przesuwa szczeliny.',
  explode: 'Zamienia pudełko lub szufladę na osobne płyty (dno, ścianki i każdy odcinek przegródki między skrzyżowaniami) w tej samej bryle, żeby każdą zmienić albo usunąć osobno.',
  mateGear: 'Dodaje drugą część przekładni ustawioną tak, że zęby wchodzą w siebie. Po zmianie liczby zębów albo modułu para sama się rozsuwa. Przesunięcie jej ręcznie albo „Odepnij” zostawia ją tam, gdzie stoi.',
  gears: 'Moduł to wielkość zęba: zazębiają się tylko zębatki o tym samym module. Odległość osi = moduł × (zęby 1 + zęby 2) / 2. Do druku moduł 1–2 mm i co najmniej 13 zębów.',
  infill: 'Wycina w bryle ażurowy wzór (kratownica, plaster miodu…), żeby zaoszczędzić filament. Przy krawędziach i wokół otworów zostaje pełna ramka. Drukuj z dużym wypełnieniem: ażur jest już w kształcie.',
  bolt: 'Dodaje drukowaną śrubę pasującą do tego gwintu jako osobną bryłę obok modelu.',
  nut: 'Dodaje nakrętkę pasującą do tej śruby jako osobną bryłę.',
  threadHole: 'Dodaje otwór z gwintem pasujący do tej śruby, wycinany w bryle, w której stoi.',
  merge: 'Pokazuje gotowy element z wyciętymi otworami. Otwory dalej możesz kliknąć i przesuwać; „Rozdziel” cofa.',
  lidFit: 'Ta pokrywka idzie za pudełkiem: zmiana szerokości, głębokości, ścianki albo przegródek w pudełku zmienia ją sama (z szczelinami na przegródki). Odłączona zostaje taka, jaka jest.',
  connector: 'Otwór pod złącze z luzem i ramką wzmacniającą od środka. „Wtyczka” robi większy otwór, przez który wtyczka sięga do gniazda na płytce w środku. Wymiary są typowe: zmierz swoje złącze suwmiarką.',
  connWall: 'Przenosi otwór (razem ze wzmocnieniem) na środek wybranej ścianki bryły, w której stoi, i ustawia grubość ścianki.',
  measure: 'Najedź na ściankę, krawędź albo otwór, żeby zobaczyć wymiar. Kliknij dwa elementy, żeby zmierzyć odległość.',
} as const;

export const PATTERN_INFO: Record<string, string> = {
  linear: 'Kopie w rzędzie co podany odstęp, wzdłuż X, Y albo Z. Przesunięcie jednej przesuwa cały rząd.',
  circle: 'Kopie równo rozłożone po okręgu wokół środka bryły. Przesunięcie jednej obraca i rozsuwa wszystkie.',
  corners: '4 kopie w rogach bryły, w której stoi element. Odsunięcie 0 zostawia element tam, gdzie jest, i kopiuje go z tym samym odsunięciem do pozostałych rogów.',
  mirrorX: 'Jedna kopia odbita na drugą stronę środka bryły (lewo–prawo).',
  mirrorY: 'Jedna kopia odbita na drugą stronę środka bryły (przód–tył).',
  mirrorXY: '3 kopie odbite względem środka bryły: razem 4 symetryczne, od miejsca, w którym stoi element.',
};

/** ⓘ mark: hover (or tap) shows what the tool does. Fixed-position popup, so side panels don't clip it. */
export function Info({ text }: { text: string }) {
  const [at, setAt] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = 240;
    // Near the bottom of the window the popup opens upwards.
    const up = r.bottom + 140 > window.innerHeight;
    setAt({ left: Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)), top: up ? r.top - 6 : r.bottom + 6, up });
  };
  return (
    <span
      className={at ? 'info open' : 'info'}
      tabIndex={0}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAt(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setAt(null)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (at) setAt(null);
        else show(e.currentTarget);
      }}
    >
      ⓘ
      {at && (
        <span className="info-pop" role="tooltip" style={{ left: at.left, top: at.top, transform: at.up ? 'translateY(-100%)' : undefined }}>
          {text}
        </span>
      )}
    </span>
  );
}
