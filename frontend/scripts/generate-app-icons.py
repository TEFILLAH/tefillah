"""
Generate the Tefillah mobile-app icons + splash from the live web Logo design.

Produces four files, overwriting the existing ones under frontend/assets/images/:

  icon.png            1024 x 1024  iOS + general app icon
                                   dark-navy square + breathing-logo badge
  adaptive-icon.png   1024 x 1024  Android adaptive-icon foreground
                                   transparent background; badge centred inside
                                   the 660 x 660 Android safe zone so launcher
                                   masks (circle, squircle, teardrop) never
                                   crop the flame.
  splash-icon.png     1024 x 1024  Expo splash screen
                                   transparent background; same badge centred.
  favicon.png          256 x  256  Web favicon

The badge composition mirrors tefillah-web/src/components/Logo.tsx exactly:
  - outer dim-olive disc
  - inner brighter olive disc
  - gold Ionicons "flame" with a dark-olive inner droplet

The flame and droplet shapes are taken from the official Ionicons SVG path data
(viewBox 0 0 512 512). svgpathtools is used to walk each Bezier segment and
sample it into a polyline; PIL then draws the resulting polygons antialiased.
"""

from __future__ import annotations

from pathlib import Path
from svgpathtools import parse_path
from PIL import Image, ImageDraw

# -----------------------------------------------------------------------------
# Colours — exact match to tefillah-web Logo + globals.css tokens
# -----------------------------------------------------------------------------
BG_NAVY        = (15, 15, 26, 255)     # var(--color-bg) in dark theme
DISC_OUTER     = (58, 47, 21, 255)     # var(--logo-disc-outer)
DISC_INNER     = (93, 74, 26, 255)     # var(--logo-disc-inner)
FLAME_GOLD     = (212, 175, 55, 255)   # var(--logo-flame)
FLAME_DROPLET  = (26, 20, 8, 255)      # var(--logo-flame-droplet)
TRANSPARENT    = (0, 0, 0, 0)

# -----------------------------------------------------------------------------
# Ionicons "flame" — original SVG path data (viewBox 0 0 512 512)
# -----------------------------------------------------------------------------
FLAME_BODY_D = (
    "M394.23,197.56a300.43,300.43,0,0,0-53.37-90"
    "C301.2,61.65,249.05,32,208,32a16,16,0,0,0-15.48,20"
    "c13.87,53-14.88,97.07-45.31,143.72"
    "C122,234.36,96,274.27,96,320"
    "c0,88.22,71.78,160,160,160s160-71.78,160-160"
    "C416,276.7,408.68,235.51,394.23,197.56Z"
)
FLAME_DROP_D = (
    "M288.33,418.69C278,429.69,265.05,432,256,432"
    "s-22-2.31-32.33-13.31S208,390.24,208,368"
    "c0-25.14,8.82-44.28,17.34-62.78,4.95-10.74,10-21.67,13-33.37"
    "a8,8,0,0,1,12.49-4.51"
    "A126.48,126.48,0,0,1,275,292"
    "c18.17,24,29,52.42,29,76C304,390.24,298.58,407.77,288.33,418.69Z"
)


def sample_path(svg_path: str, samples_per_segment: int = 64) -> list[tuple[float, float]]:
    """
    Walk every segment of an SVG path and emit a polyline approximation.

    The 'samples_per_segment' default (64) is plenty for the smooth Ionicons
    flame curves — visually indistinguishable from a vector render at 1024px.
    """
    path = parse_path(svg_path)
    points: list[tuple[float, float]] = []
    for seg in path:
        for i in range(samples_per_segment + 1):
            t = i / samples_per_segment
            p = seg.point(t)
            points.append((p.real, p.imag))
    return points


def transform_points(
    points: list[tuple[float, float]],
    *,
    scale: float,
    offset_x: float,
    offset_y: float,
) -> list[tuple[float, float]]:
    return [(x * scale + offset_x, y * scale + offset_y) for (x, y) in points]


def draw_badge(
    canvas_size: int,
    *,
    background: tuple[int, int, int, int],
    badge_diameter: float | None = None,
) -> Image.Image:
    """
    Render the full breathing-logo badge centred on a canvas_size x canvas_size
    image, with the given background colour (use TRANSPARENT for cut-outs).

    If badge_diameter is None the badge fills 92% of the canvas; otherwise the
    badge fits inside the supplied diameter (used for adaptive-icon safe zone).
    """
    img = Image.new("RGBA", (canvas_size, canvas_size), background)
    draw = ImageDraw.Draw(img)

    cx = cy = canvas_size / 2
    if badge_diameter is None:
        badge_diameter = canvas_size * 0.92

    # Disc sizing relative to the badge (matches the SVG ratios in icon-render.html).
    outer_r = badge_diameter / 2
    inner_r = outer_r * (280 / 380)
    flame_box = outer_r * 2 * (348 / 760)   # the flame box maps roughly to disc -160px
    flame_size = flame_box                  # square box

    # Draw the two olive discs.
    draw.ellipse(
        (cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r),
        fill=DISC_OUTER,
    )
    draw.ellipse(
        (cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r),
        fill=DISC_INNER,
    )

    # Place the flame so its bounding centre lands at the canvas centre.
    flame_origin_x = cx - flame_size / 2
    # Ionicons flame paths are roughly bounded in y between 32 and 480 (= height 448).
    # Centre it vertically inside the flame box.
    flame_origin_y = cy - flame_size / 2 + (flame_size * 0.02)
    flame_scale = flame_size / 512

    # Flame body — gold
    body_pts = sample_path(FLAME_BODY_D)
    body_xy = transform_points(
        body_pts,
        scale=flame_scale,
        offset_x=flame_origin_x,
        offset_y=flame_origin_y,
    )
    draw.polygon(body_xy, fill=FLAME_GOLD)

    # Inner droplet — dark olive (drawn on top, so it punches through visually)
    drop_pts = sample_path(FLAME_DROP_D)
    drop_xy = transform_points(
        drop_pts,
        scale=flame_scale,
        offset_x=flame_origin_x,
        offset_y=flame_origin_y,
    )
    draw.polygon(drop_xy, fill=FLAME_DROPLET)

    return img


def main() -> None:
    assets_dir = Path(__file__).resolve().parents[1] / "assets" / "images"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # iOS / general app icon — full bleed, dark-navy background.
    icon = draw_badge(1024, background=BG_NAVY)
    icon_path = assets_dir / "icon.png"
    icon.save(icon_path, format="PNG", optimize=True)
    print(f"wrote {icon_path}  ({icon_path.stat().st_size} bytes)")

    # Android adaptive-icon foreground — transparent BG, badge in 660 safe zone.
    adaptive = draw_badge(1024, background=TRANSPARENT, badge_diameter=660)
    adaptive_path = assets_dir / "adaptive-icon.png"
    adaptive.save(adaptive_path, format="PNG", optimize=True)
    print(f"wrote {adaptive_path}  ({adaptive_path.stat().st_size} bytes)")

    # Splash icon — transparent BG, smaller centred badge.
    splash = draw_badge(1024, background=TRANSPARENT, badge_diameter=720)
    splash_path = assets_dir / "splash-icon.png"
    splash.save(splash_path, format="PNG", optimize=True)
    print(f"wrote {splash_path}  ({splash_path.stat().st_size} bytes)")

    # Web favicon — 256 with dark-navy BG to match the rest of the dark UI.
    fav = draw_badge(256, background=BG_NAVY)
    fav_path = assets_dir / "favicon.png"
    fav.save(fav_path, format="PNG", optimize=True)
    print(f"wrote {fav_path}  ({fav_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
