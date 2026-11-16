"""Pudełko na akcesoria — korpus + wsuwana pokrywa (jaskółczy ogon), żebra japandi.
Wszystkie wymiary w mm. Zmień parametry i uruchom ponownie.
"""
import numpy as np
import trimesh
from shapely.geometry import box, Point, Polygon, LineString
from shapely.affinity import scale as sh_scale, translate as sh_translate
from shapely.ops import unary_union

# ---------- PARAMETRY ----------
# przedmioty
GRINDER_D, GRINDER_H = 40.0, 33.0
ZONE_GR_H = 38.0    # wysokość strefy młynka w korpusie (wymiary pudełka bez zmian; młynek 33 stoi na podniesionym dnie gniazda)
LIGHTER_L, LIGHTER_W, LIGHTER_T = 82.0, 26.0, 15.0   # Bic maxi, leży płasko
TAMP_PIN_D, TAMP_PIN_L = 5.0, 35.0                    # ubijak: końcówka ø5 x 35
TAMP_SQ, TAMP_HANDLE_L = 7.0, 10.0                    # ubijak: kwadratowy trzonek 7x7x10
TAMPER_L = TAMP_PIN_L + TAMP_HANDLE_L                 # całość 45
BOOK_L, BOOK_H, BOOK_T = 120.0, 30.0, 13.0            # największe opakowanie bibułek, stoi na krawędzi
BOOK_IN = 0.5                                         # jaka część wysokości opakowania siedzi w szczelinie
FILTER_D, FILTER_L = 5.0, 15.0

# luzy / konstrukcja
CL = 0.8            # luz kieszeni (łącznie na wymiar)
WALL_X = 3.0        # ścianka czołowa i tylna
WALL_Y = 4.0        # ścianka boczna (u góry, pod prowadnicę)
SEP = 1.6           # przegrody
FLOOR = 2.0
LID_T = 2.8
LID_CLEAR = 0.25    # luz pokrywy na stronę
DOVE = 2.0          # poszerzenie jaskółczego ogona na stronę
GAP_PROUD = 6.0     # o ile przedmioty wystają ponad przegrody (do chwytu)
GRIP_GAP = 11.0     # wolne miejsce na palce z obu stron młynka (przód i bok)
RING_H = 14.0       # głębokość gniazda młynka; dno wokół niego jest na tej samej wysokości
MAG_D, MAG_T, MAG_CLR = 5.0, 2.0, 0.25                # magnesy 5x2: kieszeń ø5,25 x 2,2
WALL_L = 12.0       # lewa ścianka (po stronie młynka): magnesy pokrywy + gniazdo ubijaka
BASE_H = 11.8       # warstwa szuflad pod całym wnętrzem
DR_Z0, DR_CLR = 3.0, 0.25   # dno kieszeni szuflad, luz szuflady
DR_REAR = 3.0       # grubość tylnej ścianki za kieszenią szuflad (magnes)
GRINDER_GAP = 0.3   # luz pionowy młynka pod pokrywą
RIB_R, RIB_PITCH = 1.0, 4.0
CORNER_R = 3.0
TEXT = "FKNDMN"
TEXT_DEPTH = 0.6     # głębokość grawerunku
TEXT_H_LID = 7.0     # wysokość liter na pokrywie
TEXT_H_BOT = 10.0    # wysokość liter na spodzie

# ---------- UKŁAD ----------
A_Y = BOOK_T + CL + 2 * 4.6                 # pas A: szczelina na bibułki (po 4,6 mm na palce) + filtry
B_Y = GRINDER_D + CL
lighter_len = LIGHTER_L + CL
IN_X = max(BOOK_L + CL + SEP, GRIP_GAP + GRINDER_D + CL + GRIP_GAP + SEP + lighter_len)
X = WALL_L + IN_X + WALL_X
Y = WALL_Y + A_Y + SEP + B_Y + WALL_Y
H = BASE_H + FLOOR + 1.0 + ZONE_GR_H + GRINDER_GAP + 3.0     # warstwa szuflad + młynek (dno gniazda 3 mm) + luz + 3 mm pokrywa
H = round(H, 1)
Z_LID0 = H - LID_T - 0.2                  # spód pokrywy ~ 0.2 nad półką
Z_CH0 = H - 3.0                           # początek kanału jaskółczego
Z_TOP_ITEMS = Z_CH0 - 1.2                 # góra przedmiotów (tuż pod pokrywą)
Z_BAY0 = Z_TOP_ITEMS - GAP_PROUD          # góra przegród (przedmioty wystają GAP_PROUD ponad nie)
BOOK_FLOOR = Z_TOP_ITEMS - BOOK_H         # dno szczeliny na bibułki; opakowanie wystaje górą pod pokrywę
BOOK_SHELF = Z_TOP_ITEMS - BOOK_H * (1 - BOOK_IN)   # góra półek wokół szczeliny (opakowanie wystaje o BOOK_H*BOOK_IN)
EPS = 0.01

yB0 = WALL_Y + A_Y + SEP
x0 = WALL_L


def ext(poly, z0, z1):
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m


def cyl_z(cx, cy, r, z0, z1):
    m = trimesh.creation.cylinder(radius=r, height=z1 - z0, sections=96)
    m.apply_translation([cx, cy, (z0 + z1) / 2])
    return m


def cyl_x(y, z, r, x0_, x1_):
    m = trimesh.creation.cylinder(radius=r, height=x1_ - x0_, sections=64)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    m.apply_translation([(x0_ + x1_) / 2, y, z])
    return m


def cyl_y(x, z, r, y0_, y1_):
    m = trimesh.creation.cylinder(radius=r, height=y1_ - y0_, sections=48)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m.apply_translation([x, (y0_ + y1_) / 2, z])
    return m


def bbox(x_a, x_b, y_a, y_b, z_a, z_b):
    return trimesh.creation.box(extents=[x_b - x_a, y_b - y_a, z_b - z_a],
                                transform=trimesh.transformations.translation_matrix(
                                    [(x_a + x_b) / 2, (y_a + y_b) / 2, (z_a + z_b) / 2]))


def prism_x(pts_yz, xa, xb):
    """Wielokąt w płaszczyźnie YZ wyciągnięty wzdłuż X."""
    m = trimesh.creation.extrude_polygon(Polygon(pts_yz), xb - xa)
    M = np.array([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float)
    m.apply_transform(M)
    m.apply_translation([xa, 0, 0])
    return m


# ---------- OBRYS Z ŻEBRAMI ----------
base = box(0, 0, X, Y).buffer(-CORNER_R).buffer(CORNER_R, resolution=24)
ribs = []
m0 = CORNER_R + RIB_PITCH / 2
for xx in np.arange(m0, X - m0 + 1e-6, RIB_PITCH):
    ribs += [Point(xx, 0).buffer(RIB_R, 24), Point(xx, Y).buffer(RIB_R, 24)]
for yy in np.arange(m0, Y - m0 + 1e-6, RIB_PITCH):
    ribs += [Point(0, yy).buffer(RIB_R, 24), Point(X, yy).buffer(RIB_R, 24)]
outline = unary_union([base] + ribs)
body = ext(outline, 0, H)

# ---------- WYCIĘCIA ----------
cut = []
# zatoka pod pokrywą (nad przegrodami) + kanał jaskółczy
cut.append(bbox(WALL_L, X - WALL_X, WALL_Y, Y - WALL_Y, Z_BAY0, Z_CH0 + EPS))
yc = Y / 2
wt = Y - 2 * WALL_Y
wb = wt + 2 * DOVE
dove = [(yc - wb / 2, Z_CH0), (yc + wb / 2, Z_CH0), (yc + wt / 2, H), (yc + wt / 2, H + 1),
        (yc - wt / 2, H + 1), (yc - wt / 2, H)]
cut.append(prism_x(dove, -1, X - WALL_X))

# młynek (stoi, ø40 x 33)
gx = x0 + GRIP_GAP + (GRINDER_D + CL) / 2
gy = yB0 + (GRINDER_D + CL) / 2
g_floor = Z_CH0 - GRINDER_H - GRINDER_GAP          # góra młynka 0,3 mm pod pokrywą
g_x1 = x0 + GRIP_GAP + GRINDER_D + CL + GRIP_GAP        # koniec wnęki młynka
cut.append(bbox(x0, g_x1, yB0, yB0 + B_Y, g_floor + RING_H, Z_CH0 + EPS))   # wnęka na palce, dno na wysokości gniazda
cut.append(cyl_z(gx, gy, (GRINDER_D + CL) / 2, g_floor, g_floor + RING_H + EPS))   # gniazdo młynka
# zapalniczka (leży płasko)
lx0 = g_x1 + SEP
cut.append(bbox(lx0, lx0 + lighter_len, yB0, yB0 + LIGHTER_W + CL,
                Z_TOP_ITEMS - LIGHTER_T - 0.4, Z_CH0 + EPS))
# ubijak: gniazdo w narożniku (lewy przód): kwadratowa wnęka 7,4 x 7,4 otwarta na front i na lewy bok, dalej tuleja ø5,4 wzdłuż Y w litej ściance
TZ_AX = Z_CH0 - 14.0                                 # wysokość osi ubijaka
TX_AX = 4.2                                          # oś ubijaka w X (1,5 mm ścianki z lewej)
T_Y0 = 0.2                                           # początek trzonka w Y
seat_h = TAMP_SQ + 0.4
cut.append(bbox(-1.5, TX_AX + TAMP_SQ / 2 + 0.2, -1.5, T_Y0 + TAMP_HANDLE_L + 0.2, TZ_AX - seat_h / 2, TZ_AX + seat_h / 2))
PIN_Z = TZ_AX - 1.0                                  # oś trzpienia obniżona: trzpień leży na stole przy druku bez podpór
cut.append(cyl_y(TX_AX, PIN_Z, (TAMP_PIN_D + CL + 0.2) / 2, T_Y0 + TAMP_HANDLE_L, T_Y0 + TAMPER_L + 0.5))
cut.append(cyl_x(T_Y0 + TAMP_HANDLE_L / 2, TZ_AX, (MAG_D + MAG_CLR) / 2,
                 TX_AX + TAMP_SQ / 2 + 0.2 - EPS, TX_AX + TAMP_SQ / 2 + 0.2 + MAG_T + 0.2))     # magnes w ściance gniazda
# szuflady: dwie takie same kieszenie od frontu (długi bok), w warstwie pod wnętrzem
DR_Z1 = BASE_H + FLOOR + 1.0 - 1.6                                # sufit kieszeni (1,6 mm pod dnem wnętrza)
DR_MAG_Y = 7.0                                       # magnesy szuflady tuż przy froncie (za szczeliną pod frontem)
DR_MAG_DX = 19.0                                     # magnesy po obu stronach okna
DR_WIN_W = 26.0                                      # okno pod palec w dnie
DR_FRONT_GAP = 3.3                                   # szczelina pod frontem (grubość frontu 3,0 + luz)
DR_NOTCH_L = 10.0                                    # głębokość wycięcia w dnie od frontu
DR_YE = Y - DR_REAR                                  # koniec kieszeni
DR_XA, DR_XB = x0, X - WALL_X
DR_W = (DR_XB - DR_XA - SEP) / 2
dr_pockets = [(DR_XA, DR_XA + DR_W), (DR_XA + DR_W + SEP, DR_XB)]
DR_Z1_TALL = BOOK_FLOOR - 1.6                         # prawa szuflada: strop 1,6 mm pod dnem szczeliny na bibułki
DR_CEIL = [DR_Z1, DR_Z1_TALL]                         # sufity kieszeni: 1 = pod młynkiem, 2 = wysoka
for (xa_, xb_), z1_ in zip(dr_pockets, DR_CEIL):
    cut.append(bbox(xa_, xb_, -2.0, DR_YE, DR_Z0, z1_))
    for dx_ in (-DR_MAG_DX, DR_MAG_DX):               # 2 magnesy w dnie po bokach okna (od strony kieszeni), spód zostaje gładki
        cut.append(cyl_z((xa_ + xb_) / 2 + dx_, DR_MAG_Y, (MAG_D + MAG_CLR) / 2, DR_Z0 - MAG_T - 0.2, DR_Z0 + EPS))
    cut.append(bbox(xa_, xb_, -2.0, DR_FRONT_GAP, -1.0, DR_Z0 + EPS))   # szczelina pod frontem szuflady (front schodzi do z=0)
    cut.append(bbox((xa_ + xb_) / 2 - DR_WIN_W / 2, (xa_ + xb_) / 2 + DR_WIN_W / 2, -2.0, DR_NOTCH_L, -1.0, DR_Z0 + EPS))   # okno pod palec
# zapalniczka: ściana od strony bibułek obniżona do połowy wysokości zapalniczki
l_floor = Z_TOP_ITEMS - LIGHTER_T - 0.4
cut.append(bbox(lx0, x0 + BOOK_L + CL, yB0 - SEP - EPS, yB0 + EPS, l_floor + LIGHTER_T / 2, Z_CH0 + EPS))
# magnesy w lewej ściance korpusu (pod lewym końcem pokrywy)
for dy in (-15.0, 15.0):
    cut.append(cyl_z(WALL_L / 2, Y / 2 + dy, (MAG_D + MAG_CLR) / 2, Z_CH0 - MAG_T - 0.2, Z_CH0 + EPS))
# książeczka (na krawędzi)
by0 = WALL_Y + (A_Y - (BOOK_T + CL)) / 2                      # szczelina na środku pasa A
cut.append(bbox(x0, x0 + BOOK_L + CL, by0, by0 + BOOK_T + CL, BOOK_FLOOR, Z_CH0 + EPS))
cut.append(bbox(x0, x0 + BOOK_L + CL, WALL_Y, WALL_Y + A_Y, BOOK_SHELF, Z_CH0 + EPS))   # miejsce na palce wokół wystającej połowy
# od strony młynka: bez przegrody i półki, zostaje tylko cienka ścianka szczeliny (SEP), dalej dno wnęki na palce
cut.append(bbox(x0, g_x1, by0 + BOOK_T + CL + SEP, yB0 + EPS, g_floor + RING_H, Z_CH0 + EPS))
cutter = trimesh.boolean.union(cut, engine="manifold")
korpus = trimesh.boolean.difference([body, cutter], engine="manifold")

# ---------- POKRYWA ----------
def w_at(z):  # szerokość kanału na wysokości z
    return wb - (z - Z_CH0) / (H - Z_CH0) * (wb - wt)

z0l, z1l = Z_LID0, Z_LID0 + LID_T
wl0, wl1 = w_at(z0l) - 2 * LID_CLEAR, w_at(z1l) - 2 * LID_CLEAR
lid_pts = [(yc - wl0 / 2, z0l), (yc + wl0 / 2, z0l), (yc + wl1 / 2, z1l), (yc - wl1 / 2, z1l)]
lx_a, lx_b = 0.3, X - WALL_X - 0.3
lid = prism_x(lid_pts, lx_a, lx_b)
grip = [cyl_y(xx, z1l, 0.8, yc - wl1 / 2 + 3, yc + wl1 / 2 - 3) for xx in np.arange(14.0, 14.0 + 6 * 4.0, 4.0)]
# żebra na lewym czole pokrywy (strona magnesów): ten sam rytm i promień co na ściance korpusu, żeby bryła była spójna po zamknięciu
lid_end_ribs = [cyl_z(0.0, yy, RIB_R, z0l, z1l) for yy in np.arange(m0, Y - m0 + 1e-6, RIB_PITCH)]
lid_end_ribs = trimesh.boolean.intersection(
    [trimesh.boolean.union(lid_end_ribs, engine="manifold"), prism_x(lid_pts, -2.0, 2.0)], engine="manifold")
lid = trimesh.boolean.union([lid] + grip + [lid_end_ribs], engine="manifold")
lid_cuts = [cyl_z(WALL_L / 2, Y / 2 + dy, (MAG_D + MAG_CLR) / 2, Z_LID0 - EPS, Z_LID0 + MAG_T + 0.2) for dy in (-15.0, 15.0)]
# magnesy po drugiej stronie pokrywy (prawy koniec): w odległości od końca takiej samej jak z lewej, więc przy zsunięciu pokrywy
# o LID_PARK_DX trafiają nad te same magnesy w lewej ściance i trzymają pokrywę w pozycji otwartej
LID_MAG_RX = lx_b - (WALL_L / 2 - lx_a)
LID_PARK_DX = LID_MAG_RX - WALL_L / 2
lid_cuts += [cyl_z(LID_MAG_RX, Y / 2 + dy, (MAG_D + MAG_CLR) / 2, Z_LID0 - EPS, Z_LID0 + MAG_T + 0.2) for dy in (-15.0, 15.0)]
lid = trimesh.boolean.difference([lid] + lid_cuts, engine="manifold")

# ---------- NAPIS (kwadratowa czcionka rysowana z prostych pasków, grawer) ----------
def _bar(p0, p1, t):
    return LineString([p0, p1]).buffer(t / 2, cap_style=2, join_style=2)


def glyph(ch, h=10.0, t=2.0):
    """Litera w siatce wysokości h; pasek t. Zwraca (kształt, szerokość)."""
    if ch == "F":
        w = 6.0
        g = unary_union([_bar((t / 2, -1), (t / 2, h + 1), t), _bar((-1, h - t / 2), (w + 1, h - t / 2), t),
                         _bar((-1, h / 2), (w - 1.2, h / 2), t)])
    elif ch == "K":
        w = 7.0
        g = unary_union([_bar((t / 2, -1), (t / 2, h + 1), t), _bar((1.5, 4.5), (w + 2, 4.5 + 1.2 * (w + 0.5)), t),
                         _bar((1.5, 5.5), (w + 2, 5.5 - 1.2 * (w + 0.5)), t)])
    elif ch == "N":
        w = 7.0
        g = unary_union([_bar((t / 2, -1), (t / 2, h + 1), t), _bar((w - t / 2, -1), (w - t / 2, h + 1), t),
                         _bar((t / 2, h + 0.5), (w - t / 2, -0.5), t)])
    elif ch == "D":
        w = 7.0
        outer = Polygon([(0, 0), (w - 2.4, 0), (w, 2.4), (w, h - 2.4), (w - 2.4, h), (0, h)])
        return outer.difference(outer.buffer(-t, join_style=2)), w
    elif ch == "M":
        w = 9.0
        g = unary_union([_bar((t / 2, -1), (t / 2, h + 1), t), _bar((w - t / 2, -1), (w - t / 2, h + 1), t),
                         LineString([(t / 2, h + 0.5), (w / 2, 3.0), (w - t / 2, h + 0.5)]).buffer(
                             0.9, cap_style=2, join_style=2, mitre_limit=1.5)])
    else:
        raise ValueError(ch)
    return g.intersection(box(0, 0, w, h)), w


def text_shape(s, height, spacing=2.0):
    parts, x = [], 0.0
    for ch in s:
        g, w = glyph(ch)
        parts.append(sh_translate(g, x, 0))
        x += w + spacing
    shp = unary_union(parts)
    return sh_scale(shp, height / 10.0, height / 10.0, origin=(0, 0))


def centered(shp, cx, cy):
    x0_, y0_, x1_, y1_ = shp.bounds
    return sh_translate(shp, cx - (x0_ + x1_) / 2, cy - (y0_ + y1_) / 2)


def ext_multi(shp, z0, z1):
    polys = list(shp.geoms) if hasattr(shp, "geoms") else [shp]
    return trimesh.boolean.union([ext(p, z0, z1) for p in polys if p.area > 1e-6], engine="manifold")


lid_text = centered(text_shape(TEXT, TEXT_H_LID), (lx_a + lx_b) / 2, yc)
bot_text = centered(text_shape(TEXT, TEXT_H_BOT), X / 2, Y / 2)
bot_text = sh_scale(bot_text, xfact=-1, yfact=1, origin="center")        # czytelny po odwróceniu pudełka
lid = trimesh.boolean.difference([lid, ext_multi(lid_text, z1l - TEXT_DEPTH, z1l + 0.3)], engine="manifold")
korpus = trimesh.boolean.difference([korpus, ext_multi(bot_text, -0.1, TEXT_DEPTH)], engine="manifold")

# ---------- UBIJAK (osobny wydruk; widoczna część = wycinek obrysu pudełka z żebrami, równo z korpusem) ----------
import manifold3d as m3


def revolve_z(prof):
    mf = m3.Manifold.revolve(m3.CrossSection([prof]), 72)
    mm = mf.to_mesh()
    return trimesh.Trimesh(vertices=np.array(mm.vert_properties)[:, :3], faces=np.array(mm.tri_verts))


rp = TAMP_PIN_D / 2
PL_Z0, PL_Z1 = TZ_AX - TAMP_SQ / 2, TZ_AX + TAMP_SQ / 2
PL_X1, PL_Y1 = TX_AX + TAMP_SQ / 2, T_Y0 + TAMP_HANDLE_L        # tył rączki (luz 0,2 do gniazda)
# rączka = ten sam obrys z żebrami i zaokrąglonym narożnikiem co korpus, wycięty w rozmiarze gniazda
plug = trimesh.boolean.intersection([ext(outline, PL_Z0, PL_Z1), bbox(-2.0, PL_X1, -2.0, PL_Y1, PL_Z0 - 1, PL_Z1 + 1)], engine="manifold")
y_a, y_tip = PL_Y1 - 1.0, T_Y0 + TAMPER_L
pin = revolve_z([(0.0, y_a), (rp, y_a), (rp, y_tip - 0.4), (rp - 0.4, y_tip), (0.0, y_tip)])
R = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float)   # oś rewolucji z -> +Y
pin.apply_transform(R)
pin.apply_translation([TX_AX, 0, PIN_Z])
ubijak_asm = trimesh.boolean.union([plug, pin], engine="manifold")
ubijak_asm = trimesh.boolean.difference(                    # magnes od strony +X (naprzeciw magnesu w ściance gniazda)
    [ubijak_asm, cyl_x(T_Y0 + TAMP_HANDLE_L / 2, TZ_AX, (MAG_D + MAG_CLR) / 2, PL_X1 - MAG_T - 0.2, PL_X1 + 0.1)], engine="manifold")
ubijak = ubijak_asm.copy()                                  # do druku: pozycja jak w pudełku, rączka na płaskim spodzie, trzpień leży na stole
ubijak.apply_translation([0, 0, -ubijak.bounds[0][2]])

# ---------- SZUFLADY (druk w pozycji roboczej: front pionowo, wnętrze do góry; każda ze swoim rytmem żeber frontu) ----------
dr_x0, dr_x1 = DR_CLR, DR_W - DR_CLR                 # szerokość szuflady względem kieszeni
dr_z0 = DR_Z0 + 0.2
dr_y_back = DR_YE - 0.4                              # tylna ścianka szuflady
DR_FRONT_T = 3.0
DR_PARK_DY = (dr_y_back - DR_MAG_Y) - DR_MAG_Y        # o ile wysunięta szuflada „zaskakuje” na magnesach
DR_ZB = 0.0                                          # front szuflady schodzi do dołu pudełka


def make_drawer(xa_, ceil_z):
    """Szuflada w kieszeni zaczynającej się w x = xa_ i ze stropem na ceil_z. Zwraca (do druku, dr_z1)."""
    dr_z1 = ceil_z - 0.4
    front_zone = ext(outline, DR_ZB, dr_z1)
    front_box = bbox(xa_ + dr_x0, xa_ + dr_x1, -2.0, DR_FRONT_T, DR_ZB - 1, dr_z1 + 1)
    dr_front = trimesh.boolean.intersection([front_zone, front_box], engine="manifold")   # panel z żebrami jak korpus
    dr_tray = bbox(xa_ + dr_x0, xa_ + dr_x1, DR_FRONT_T - 1.0, dr_y_back, dr_z0, dr_z1)
    d = trimesh.boolean.union([dr_front, dr_tray], engine="manifold")
    dxc_ = xa_ + (dr_x0 + dr_x1) / 2
    inner = bbox(xa_ + dr_x0 + 1.2, xa_ + dr_x1 - 1.2, DR_FRONT_T, dr_y_back - 3.4, dr_z0 + 1.0, dr_z1 + 1.0)
    # chwyt: front schodzi do z=0, pod tacką (z 0..3,2) jest szczelina na palec w oknie dna korpusu, hak = tył frontu
    # magnesy od spodu tacki naprzeciw magnesów w dnie korpusu; garby w dnie wnętrza dają krycie 0,8 mm nad magnesem
    # drugi komplet magnesów z tyłu szuflady (lustrzanie do frontu): po wysunięciu o DR_PARK_DY trafiają nad magnesy w dnie korpusu i trzymają szufladę
    ys_ = (DR_MAG_Y, dr_y_back - DR_MAG_Y)
    boss = [cyl_z(dxc_ + dx_, y_, 4.0, dr_z0 + 1.0 - 0.1, dr_z0 + 1.0 + 2.0) for dx_ in (-DR_MAG_DX, DR_MAG_DX) for y_ in ys_]
    mags = [cyl_z(dxc_ + dx_, y_, (MAG_D + MAG_CLR) / 2, dr_z0 - 1.0, dr_z0 + MAG_T + 0.2) for dx_ in (-DR_MAG_DX, DR_MAG_DX) for y_ in ys_]
    d = trimesh.boolean.difference([d, inner], engine="manifold")
    d = trimesh.boolean.union([d] + boss, engine="manifold")
    d = trimesh.boolean.difference([d] + mags, engine="manifold")
    d.apply_translation([-dxc_, 0, -DR_ZB])           # do druku: środek w X=0, front na z=0
    return d, dr_z1


drawers = []                                          # (do druku, w korpusie, dr_z1)
for (xa_, xb_), z1_ in zip(dr_pockets, DR_CEIL):
    dm, dz1 = make_drawer(xa_, z1_)
    da = dm.copy()
    da.apply_translation([(xa_ + xb_) / 2, 0, DR_ZB])
    drawers.append((dm, da, dz1))
drawer = drawers[0][0]                                # niska (nr 1, lewa)
drawer_tall = drawers[1][0]                           # wysoka (nr 2, prawa)
drawer_asm = [d[1] for d in drawers]

# ---------- KONTROLA ----------
def _vol(m):
    return m.volume if len(m.faces) else 0.0


print(f"Ubijak: {ubijak.extents.round(1)} mm, watertight={ubijak.is_watertight}, "
      f"kolizja z korpusem: {_vol(trimesh.boolean.intersection([korpus, ubijak_asm], engine='manifold')):.3f} mm3")
for i, (dm, d, dz1) in enumerate(drawers):
    print(f"Szuflada {i+1}: {dm.extents.round(1)} mm, watertight={dm.is_watertight}, "
          f"kolizja z korpusem: {_vol(trimesh.boolean.intersection([korpus, d], engine='manifold')):.3f} mm3, "
          f"wnętrze ok. {(DR_W - 2 * DR_CLR - 2.4) * (dr_y_back - 3.4 - DR_FRONT_T) * (dz1 - dr_z0 - 1.0) / 1000:.1f} ml")
print(f"Korpus: {korpus.extents.round(1)} mm, watertight={korpus.is_watertight}, obj={korpus.volume/1000:.0f} cm3")
print(f"Pokrywa: {lid.extents.round(1)} mm, watertight={lid.is_watertight}, obj={lid.volume/1000:.1f} cm3")
print(f"Kolizja korpus/pokrywa: {_vol(trimesh.boolean.intersection([korpus, lid], engine='manifold')):.3f} mm3")
print(f"Zewn. X*Y*Z = {X:.1f} x {Y:.1f} x {H:.1f} (bez żeber +{RIB_R:.1f} z każdej strony)")

lid_print = lid.copy()
lid_print.apply_translation([0, 0, -lid_print.bounds[0][2]])
ubijak.export("pudelko_ubijak.stl")
drawer.export("pudelko_szuflada.stl")
drawer_tall.export("pudelko_szuflada_wysoka.stl")
korpus.export("pudelko_korpus.stl")
lid_print.export("pudelko_pokrywa.stl")
print("zapisano STL")
