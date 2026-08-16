"""Gera ícone e splash nativos do Android a partir da arte 1024x1024 do PlayECG.

O `npx cap sync` NÃO toca nesses recursos: o `cap add android` copia o ícone do
Capacitor uma vez e nunca mais mexe. Por isso eles são gerados aqui e commitados.

A arte é o mascote sobre um fundo azul que sangra até a borda. Nada disso cabe
direto num ícone: o launcher recorta em círculo ou quadrado arredondado conforme
o aparelho, e só garante os 72dp centrais de uma tela de 108dp. Com a arte
inteira, o chapéu e a mão levantada seriam cortados.

Então o mascote é recortado do fundo e recomposto menor, dentro da zona segura,
sobre um fundo reconstruído a partir do azul da própria arte.

Uso:  python assets/generate-android-assets.py   (requer Pillow)
"""

import os
from collections import deque
from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "icon.png")
OUT = os.path.join(HERE, os.pardir, "android", "app", "src", "main", "res")

# Fundo do splash: o mesmo #0D1E30 do backgroundColor em capacitor.config.ts. Se
# os dois divergirem, a troca entre a janela de launch e o splash do plugin
# aparece como um flash.
SPLASH_BG = (13, 30, 48)

# Limiares de "azulidade" (canal azul menos o mais forte entre vermelho e verde)
# que separam o fundo do mascote. A distribuição da arte é bimodal: o mascote
# fica abaixo de ~45 e o fundo acima de ~85. Abaixo de LO é mascote, acima de HI
# é fundo, e no meio vira alfa parcial — é o que preserva a sombra projetada.
LO, HI = 50, 92

MASTER = 1024
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

# Fração da tela ocupada pelo mascote em cada saída. A do adaptive icon é a menor
# de propósito: ela é medida sobre os 108dp, dos quais só os 72dp centrais
# aparecem, então 0.52 aqui dá ~78% do que a pessoa enxerga.
FG_ADAPTIVE = 0.52
FG_LEGACY_SQUARE = 0.80
FG_LEGACY_ROUND = 0.64
FG_SPLASH = 0.50


def _blueness(im):
    r, g, b = im.split()
    return ImageChops.subtract(b, ImageChops.lighter(r, g))


def _background_reachable(blue, size):
    """Marca o fundo: azul o bastante E ligado à borda da imagem.

    A conectividade é o que impede que as partes azuladas do próprio mascote —
    o knob azul e os pads das mãos — sejam confundidas com fundo.
    """
    w, h = size
    data = blue.tobytes()
    is_blue = bytearray(1 if v >= LO else 0 for v in data)
    reached = bytearray(w * h)
    q = deque()

    def seed(i):
        if is_blue[i] and not reached[i]:
            reached[i] = 1
            q.append(i)

    for x in range(w):
        seed(x)
        seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w)
        seed(y * w + w - 1)

    while q:
        i = q.popleft()
        x, y = i % w, i // w
        if x > 0:
            seed(i - 1)
        if x < w - 1:
            seed(i + 1)
        if y > 0:
            seed(i - w)
        if y < h - 1:
            seed(i + w)
    return reached


def robot_layer(im, reached):
    """O mascote recortado do fundo, já cortado na sua caixa delimitadora."""
    data = _blueness(im).tobytes()
    span = HI - LO
    alpha = bytearray(len(data))
    for i, v in enumerate(data):
        if reached[i]:
            continue
        alpha[i] = 255 if v <= LO else (0 if v >= HI else 255 * (HI - v) // span)

    mask = Image.frombytes("L", im.size, bytes(alpha))
    layer = im.convert("RGBA")
    layer.putalpha(mask)
    return layer.crop(mask.getbbox())


def background_field(im, reached):
    """Reconstrói o azul do fundo por trás do mascote.

    Difusão a partir do que se conhece: borra e recoloca o fundo real por cima,
    repetidamente, até o buraco deixado pelo mascote se fechar. Roda em baixa
    resolução porque o resultado é liso — reescalar não perde nada, e evita
    depender de numpy só para isto.
    """
    small = 96
    w, h = im.size
    known = Image.frombytes("L", (w, h), bytes(255 if r else 0 for r in reached))
    known_s = known.resize((small, small), Image.LANCZOS).point(lambda v: 255 if v > 200 else 0)
    src_s = im.resize((small, small), Image.LANCZOS)

    field = src_s.copy()
    for _ in range(160):
        field = field.filter(ImageFilter.GaussianBlur(3))
        field.paste(src_s, (0, 0), known_s)
    # Última passada sem recolocar, para diluir a emenda na borda do buraco.
    field = field.filter(ImageFilter.GaussianBlur(6))
    return field.resize((MASTER, MASTER), Image.LANCZOS)


def centered(canvas, layer, width_ratio):
    w = round(canvas.width * width_ratio)
    h = round(layer.height * w / layer.width)
    resized = layer.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((canvas.width - w) // 2, (canvas.height - h) // 2))
    return canvas


def _tile(field, draw_mask):
    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    mask = Image.new("L", (MASTER, MASTER), 0)
    draw_mask(ImageDraw.Draw(mask))
    tile = field.convert("RGBA")
    tile.putalpha(mask)
    canvas.alpha_composite(tile)
    return canvas


def legacy_square(field, robot):
    tile = _tile(field, lambda d: d.rounded_rectangle((0, 0, MASTER - 1, MASTER - 1), 180, fill=255))
    return centered(tile, robot, FG_LEGACY_SQUARE)


def legacy_round(field, robot):
    tile = _tile(field, lambda d: d.ellipse((0, 0, MASTER - 1, MASTER - 1), fill=255))
    return centered(tile, robot, FG_LEGACY_ROUND)


def adaptive_foreground(robot):
    # Fundo transparente: o adaptive icon compõe com a camada de fundo.
    return centered(Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0)), robot, FG_ADAPTIVE)


def emit(name, master, base_dp):
    for density, factor in DENSITIES.items():
        size = round(base_dp * factor)
        d = os.path.join(OUT, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(os.path.join(d, f"{name}.png"))


SPLASHES = {
    "drawable/splash.png": (480, 320),
    "drawable-land-mdpi/splash.png": (480, 320),
    "drawable-land-hdpi/splash.png": (800, 480),
    "drawable-land-xhdpi/splash.png": (1280, 720),
    "drawable-land-xxhdpi/splash.png": (1600, 960),
    "drawable-land-xxxhdpi/splash.png": (1920, 1280),
    "drawable-port-mdpi/splash.png": (320, 480),
    "drawable-port-hdpi/splash.png": (480, 800),
    "drawable-port-xhdpi/splash.png": (720, 1280),
    "drawable-port-xxhdpi/splash.png": (960, 1600),
    "drawable-port-xxxhdpi/splash.png": (1280, 1920),
}


def splashes(robot):
    """Splash chapado no azul-escuro do app, com o mascote centrado."""
    for rel, (w, h) in SPLASHES.items():
        canvas = Image.new("RGB", (w, h), SPLASH_BG)
        mark_w = round(min(w, h) * FG_SPLASH)
        mark_h = round(robot.height * mark_w / robot.width)
        resized = robot.resize((mark_w, mark_h), Image.LANCZOS)
        canvas.paste(resized, ((w - mark_w) // 2, (h - mark_h) // 2), resized)
        path = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        canvas.save(path)


def main():
    im = Image.open(SRC).convert("RGB")
    if im.size != (MASTER, MASTER):
        im = im.resize((MASTER, MASTER), Image.LANCZOS)

    reached = _background_reachable(_blueness(im), im.size)
    robot = robot_layer(im, reached)
    field = background_field(im, reached)

    emit("ic_launcher", legacy_square(field, robot), 48)
    emit("ic_launcher_round", legacy_round(field, robot), 48)
    emit("ic_launcher_foreground", adaptive_foreground(robot), 108)
    emit("ic_launcher_background", field.convert("RGBA"), 108)
    splashes(robot)
    print("recursos gravados em", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
