import { useState } from 'react';

/** Short explanations of what each tool does, shown by the ⓘ marks. */
export const INFO = {
  dims: 'Wymiary tego elementu w milimetrach. Strzałki ↑↓ w polu zmieniają o krok, z Shiftem o 10 kroków.',
  position: 'Położenie środka elementu (X, Y) i jego spodu (Z) w mm. Element postawiony w innej bryle sam do niej dołącza.',
  rotation: 'Obrót wokół osi X, Y, Z w stopniach. Przyciski obracają o 90° i zostawiają element na tej samej wysokości.',
  pattern: 'Robi powiązane kopie: zmiana wymiarów jednej zmienia wszystkie, a przesunięcie jednej przesuwa resztę według szyku. „Odłącz” wyłącza kopię z szyku.',
  magnets: 'Robi gniazda na magnesy na górnej krawędzi ścianek pudełka. Gdzie ścianka jest za cienka, dokłada słupek; w pokrywce robi lustrzane gniazda.',
  texture: 'Wzór na wybranej ściance jako prawdziwa geometria (żeberka, rowki, radełko, kropki, plaster miodu): wypukły albo wycięty.',
  print: 'Bryła = osobny wydruk. Elementy jednej bryły sklejają się, a otwory wycinają tylko swoją bryłę.',
  hole: '„Otwór” wycina materiał z bryły, do której należy; „Bryła” to materiał.',
  body: 'Do której bryły należy element. Zwykle dobiera się sama: element postawiony w pudełku dołącza do jego bryły.',
  group: 'Cała bryła: wszystkie elementy, które drukują się razem. Przesuwasz, obracasz i duplikujesz je naraz.',
  matchHole: 'Robi gniazdo o tym samym kształcie z luzem 0,3 mm, wycinane w części, na której stanie czop.',
  drawers: 'Dodaje szuflady dopasowane do każdego otworu obudowy, z luzem 0,3 mm.',
  lid: 'Dodaje pokrywkę o wymiarach pudełka obok niego. Jeśli pudełko ma gniazda na magnesy, sprawdzi je i zaproponuje lustrzane w pokrywce.',
  explode: 'Zamienia pudełko lub szufladę na osobne płyty (dno, ścianki, przegródki) w tej samej bryle, żeby każdą zmienić osobno.',
  bolt: 'Dodaje drukowaną śrubę pasującą do tego gwintu jako osobną bryłę obok modelu.',
  nut: 'Dodaje nakrętkę pasującą do tej śruby jako osobną bryłę.',
  threadHole: 'Dodaje otwór z gwintem pasujący do tej śruby, wycinany w bryle, w której stoi.',
  merge: 'Pokazuje gotowy element z wyciętymi otworami. Otwory dalej możesz kliknąć i przesuwać; „Rozdziel” cofa.',
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
