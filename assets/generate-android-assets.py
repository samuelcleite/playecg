"""Gera ícone e splash nativos do Android a partir da arte 1024x1024 do PlayECG.

O `npx cap sync` NÃO toca nesses recursos: o `cap add android` copia o ícone do
Capacitor uma vez e nunca mais mexe. Por isso eles são gerados aqui e commitados.

A arte de origem tem cantos arredondados e a palavra "PlayECG" embaixo. Nenhum
dos dois sobrevive ao recorte do adaptive icon (o launcher aplica a própria
máscara e só garante os 66% centrais), então aqui a onda é extraída sozinha e
recomposta sobre fundo chapado, dentro da zona segura.

Uso:  python assets/generate-android-assets.py   (requer Pillow)
"""

import os
from PIL import Image, ImageChops, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "icon.png")
OUT = os.path.join(HERE, os.pardir, "android", "app", "src", "main", "res")

BG = (13, 30, 48)          # #0D1E30, o mesmo theme_color do manifest
WAVE = (130, 222, 95)      # verde da arte original
# Quanto o canal verde da onda supera o mais forte entre vermelho e azul. Serve
# de escala para o alfa: no fundo escuro e no branco de fora do tile a diferença
# é <= 0, então os dois somem sem deixar franja nos cantos arredondados.
WAVE_EXCESS = WAVE[1] - max(WAVE[0], WAVE[2])

# Recorte vertical que contém a onda e exclui o texto.
CROP = (0, 170, 1024, 797)

MASTER = 1024
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def wave_layer():
    """A onda isolada, com alfa derivado de quanto o pixel puxa para o verde."""
    r, g, b = Image.open(SRC).convert("RGB").crop(CROP).split()
    excess = ImageChops.subtract(g, ImageChops.lighter(r, b))
    alpha = excess.point(lambda v: min(255, round(v * 255 / WAVE_EXCESS)))
    layer = Image.new("RGBA", alpha.size, WAVE + (0,))
    layer.putalpha(alpha)
    return layer


def centered(canvas, layer, width_ratio):
    w = round(MASTER * width_ratio)
    h = round(layer.height * w / layer.width)
    resized = layer.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((MASTER - w) // 2, (MASTER - h) // 2))
    return canvas


def rounded_square(layer):
    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    mask = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, MASTER - 1, MASTER - 1), 180, fill=255)
    tile = Image.new("RGBA", (MASTER, MASTER), BG + (255,))
    tile.putalpha(mask)
    canvas.alpha_composite(tile)
    return centered(canvas, layer, 0.80)


def circle(layer):
    canvas = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    mask = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, MASTER - 1, MASTER - 1), fill=255)
    tile = Image.new("RGBA", (MASTER, MASTER), BG + (255,))
    tile.putalpha(mask)
    canvas.alpha_composite(tile)
    return centered(canvas, layer, 0.62)


def foreground(layer):
    # Fundo transparente: o adaptive icon compõe com @color/ic_launcher_background.
    # 0.60 de largura mantém a onda dentro dos 66,7% centrais que o launcher garante.
    return centered(Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0)), layer, 0.60)


def emit(name, master, base_dp):
    for density, factor in DENSITIES.items():
        size = round(base_dp * factor)
        d = os.path.join(OUT, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(os.path.join(d, f"{name}.png"))


def splashes(layer, sizes):
    """Splash chapado com a onda centrada, no tamanho exato de cada densidade."""
    for rel, (w, h) in sizes.items():
        canvas = Image.new("RGB", (w, h), BG)
        mark_w = round(min(w, h) * 0.5)
        mark_h = round(layer.height * mark_w / layer.width)
        resized = layer.resize((mark_w, mark_h), Image.LANCZOS)
        canvas.paste(resized, ((w - mark_w) // 2, (h - mark_h) // 2), resized)
        path = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        canvas.save(path)


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

layer = wave_layer()
emit("ic_launcher", rounded_square(layer), 48)
emit("ic_launcher_round", circle(layer), 48)
emit("ic_launcher_foreground", foreground(layer), 108)
splashes(layer, SPLASHES)
print("recursos gravados em", os.path.normpath(OUT))
