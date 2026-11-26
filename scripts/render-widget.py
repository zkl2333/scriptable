"""将 snapshot-widgets.mjs 导出的已布局 IR 树（含 _frame / _lines / _fontScale）渲染为 PNG。

用法：python scripts/render-widget.py snapshots/pixel-pet-medium.json [...]
与 Web 预览器共享同一套二维提议-应答布局引擎（preview/layout.js）输出，消除两套布局分叉。
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCALE = 3
DEFAULT_LINE_RATIO = 1.16

_VENV = Path(sys.executable).parent.parent
_FONT_DIR = _VENV.parent / "fonts"
_MATPLOTLIB_TTF = _VENV / "Lib/site-packages/matplotlib/mpl-data/fonts/ttf"


def _font_path(family: str, weight: int) -> Path:
    bold = weight >= 600
    if family == "monospace":
        name = "DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf"
        return _MATPLOTLIB_TTF / name
    name = "NotoSansSC-Bold.ttf" if bold else "NotoSansSC-Regular.ttf"
    return _FONT_DIR / name


_font_cache: dict = {}


def get_font(family: str, size: float, weight: int) -> ImageFont.FreeTypeFont:
    key = (family, max(1, round(size * SCALE)), weight)
    if key not in _font_cache:
        path = _font_path(family, weight)
        if path.exists():
            _font_cache[key] = ImageFont.truetype(str(path), key[1])
        else:
            _font_cache[key] = ImageFont.load_default()
    return _font_cache[key]


def parse_color(value, appearance="light", default=(0, 0, 0, 255)):
    if not value:
        return default
    if appearance == "dark" and value.get("dark"):
        return parse_color(value["dark"], "light", default)
    hex_value = value.get("hex", "#000000").lstrip("#")
    alpha = round(value.get("alpha", 1) * 255)
    if len(hex_value) == 3:
        hex_value = "".join(ch * 2 for ch in hex_value)
    rgb = tuple(int(hex_value[i : i + 2], 16) for i in (0, 2, 4))
    return (*rgb, alpha)


def gradient_array(gradient, width: int, height: int, appearance="light") -> np.ndarray:
    colors = gradient.get("colors") or [{"hex": "#FFFFFF", "alpha": 1}]
    locations = gradient.get("locations") or list(np.linspace(0, 1, len(colors)))
    start = gradient.get("startPoint") or {"x": 0, "y": 0}
    end = gradient.get("endPoint") or {"x": 0, "y": 1}
    xs, ys = np.meshgrid(np.arange(width), np.arange(height))
    dx, dy = end["x"] - start["x"], end["y"] - start["y"]
    denom = dx * dx + dy * dy or 1
    t = (((xs / max(width - 1, 1)) - start["x"]) * dx
         + ((ys / max(height - 1, 1)) - start["y"]) * dy) / denom
    t = np.clip(t, 0, 1)
    rgba = np.array([parse_color(c, appearance) for c in colors], dtype=float)
    locs = np.array(locations, dtype=float)
    out = np.zeros((height, width, 4))
    for channel in range(4):
        out[:, :, channel] = np.interp(t, locs, rgba[:, channel])
    return out.astype(np.uint8)


def render_draw_ops(ops, box, draw: ImageDraw.ImageDraw, natural_size=None, appearance="light"):
    """把 DrawContext ops 画进 box（按 natural_size 等比缩放）。"""
    sx = box[2] / (natural_size["width"] if natural_size and natural_size.get("width") else max(1, box[2]))
    sy = box[3] / (natural_size["height"] if natural_size and natural_size.get("height") else max(1, box[3]))
    for op in ops or []:
        color = parse_color(op.get("color"), appearance)
        op_type = op.get("type")
        if op_type == "path":
            pts = []
            for cmd in op.get("commands") or []:
                pt = cmd.get("point")
                if pt:
                    pts.append((box[0] + pt["x"] * sx, box[1] + pt["y"] * sy))
            if len(pts) >= 2:
                if op.get("mode") == "fill" and len(pts) >= 3:
                    draw.polygon(pts, fill=color)
                else:
                    draw.line(pts, fill=color, width=max(1, round((op.get("lineWidth") or 1) * sx)))
            continue
        rect = op.get("rect")
        if not rect:
            continue
        x0 = box[0] + rect["x"] * sx
        y0 = box[1] + rect["y"] * sy
        x1 = x0 + rect["width"] * sx
        y1 = y0 + rect["height"] * sy
        lw = max(1, round((op.get("lineWidth") or 1) * sx))
        if op_type in ("fillRect", "fill"):
            draw.rectangle([x0, y0, x1, y1], fill=color)
        elif op_type == "fillEllipse":
            draw.ellipse([x0, y0, x1, y1], fill=color)
        elif op_type == "strokeEllipse":
            draw.ellipse([x0, y0, x1, y1], outline=color, width=lw)
        elif op_type == "roundedRect":
            radius = (op.get("radius") or op.get("cornerWidth") or 0) * sx
            draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=color)
        elif op_type == "strokeRoundedRect":
            radius = (op.get("radius") or op.get("cornerWidth") or 0) * sx
            draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=color, width=lw)
        elif op_type == "strokeRect":
            draw.rectangle([x0, y0, x1, y1], outline=color, width=lw)
        elif op_type == "text":
            font_info = op.get("font") or {}
            font = get_font(font_info.get("family") or "system", (font_info.get("size") or 12) * (sx / SCALE), font_info.get("weight") or 400)
            draw.text((x0, y0), str(op.get("text") or ""), font=font, fill=color)


class FrameRenderer:
    """直接消费 preview/layout.js 产出的绝对几何坐标（_frame / _lines / _fontScale）。"""

    def __init__(self, image: Image.Image, appearance="light"):
        self.image = image
        self.overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.overlay)
        self.appearance = appearance

    def composite(self):
        self.image.alpha_composite(self.overlay)

    def color(self, value, default=(0, 0, 0, 255)):
        return parse_color(value, self.appearance, default)

    def render_background(self, node, frame, is_root=False):
        x, y, w, h = frame["x"], frame["y"], frame["width"], frame["height"]
        if w <= 0 or h <= 0:
            return
        if is_root and node.get("backgroundStyle") == "transparent":
            glass = (255, 255, 255, 42) if self.appearance == "light" else (255, 255, 255, 24)
            self.draw.rounded_rectangle(
                [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE],
                radius=22 * SCALE,
                fill=glass,
                outline=(255, 255, 255, 96),
                width=SCALE,
            )
            return
        radius = (node.get("cornerRadius") or 0) * SCALE
        gradient = node.get("backgroundGradient")
        if gradient and gradient.get("colors"):
            array = gradient_array(gradient, max(1, round(w)), max(1, round(h)), self.appearance)
            patch = Image.fromarray(array, "RGBA").resize(
                (max(1, round(w * SCALE)), max(1, round(h * SCALE))), Image.BILINEAR
            )
            self.image.paste(patch, (round(x * SCALE), round(y * SCALE)), patch)
        elif node.get("backgroundColor"):
            fill = self.color(node["backgroundColor"])
            rect = [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE]
            if radius > 0:
                self.draw.rounded_rectangle(rect, radius=radius, fill=fill)
            else:
                self.draw.rectangle(rect, fill=fill)
        if node.get("borderWidth"):
            border_color = self.color(node.get("borderColor"))
            rect = [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE]
            lw = max(1, round(node["borderWidth"] * SCALE))
            if radius > 0:
                self.draw.rounded_rectangle(rect, radius=radius, outline=border_color, width=lw)
            else:
                self.draw.rectangle(rect, outline=border_color, width=lw)
        bg_image = node.get("backgroundImage")
        if bg_image and bg_image.get("kind") == "draw":
            render_draw_ops(
                bg_image.get("ops"),
                (x * SCALE, y * SCALE, w * SCALE, h * SCALE),
                self.draw,
                bg_image.get("size"),
                self.appearance,
            )

    def render_progress(self, node, frame):
        progress = node.get("progress")
        if not progress:
            return
        x, y, w, h = frame["x"] * SCALE, frame["y"] * SCALE, frame["width"] * SCALE, frame["height"] * SCALE
        val = max(0.0, min(100.0, float(progress.get("value") or 0)))
        fg = self.color(progress.get("progressColor"), (0, 122, 255, 255))
        track = self.color(progress.get("trackColor"), (128, 128, 128, 56))
        if progress.get("style") == "linear":
            radius = h / 2
            self.draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=track)
            fw = w * (val / 100.0)
            if fw > 0:
                self.draw.rounded_rectangle([x, y, x + fw, y + h], radius=radius, fill=fg)
        else:
            lw = max(1, round((progress.get("thickness") or 5) * SCALE))
            inset = lw / 2
            bbox = [x + inset, y + inset, x + w - inset, y + h - inset]
            self.draw.ellipse(bbox, outline=track, width=lw)
            if val > 0:
                self.draw.arc(bbox, start=-90, end=-90 + 360 * (val / 100.0), fill=fg, width=lw)

    def render_node(self, node, is_root=False):
        frame = node.get("_frame")
        if not frame:
            return
        node_type = node.get("type")
        if node_type == "spacer":
            return
        if node_type in ("list", "stack"):
            self.render_background(node, frame, is_root=is_root)
            self.render_progress(node, frame)
            for child in node.get("elements") or []:
                self.render_node(child)
            return
        x, y, w, h = frame["x"], frame["y"], frame["width"], frame["height"]
        if node_type in ("text", "date"):
            styling = node.get("styling") or {}
            font_info = styling.get("font") or {}
            size = node.get("_fontScale") or font_info.get("size") or 15
            weight = font_info.get("weight") or 400
            family = font_info.get("family") or "system"
            font = get_font(family, size, weight)
            color = self.color(styling.get("textColor"))
            lines = node.get("_lines") or [node.get("text") or node.get("date") or ""]
            lh = size * DEFAULT_LINE_RATIO
            align = node.get("horizontalTextAlignment") or "left"
            for idx, line in enumerate(lines):
                text_w = self.draw.textlength(line, font=font) / SCALE
                tx = x
                if align == "center":
                    tx = x + max(0.0, (w - text_w) / 2)
                elif align == "right":
                    tx = x + max(0.0, w - text_w)
                self.draw.text((tx * SCALE, (y + idx * lh) * SCALE), line, font=font, fill=color)
            return
        if node_type == "image":
            codable = node.get("codableImage") or {}
            if codable.get("kind") == "draw":
                render_draw_ops(
                    codable.get("ops"),
                    (x * SCALE, y * SCALE, w * SCALE, h * SCALE),
                    self.draw,
                    codable.get("size"),
                    self.appearance,
                )
            return
        if node_type in ("button", "refreshButton", "toggle"):
            bg = (0, 122, 255, 36) if node_type != "toggle" else (120, 120, 128, 36)
            fg = (0, 122, 255, 255) if node_type != "toggle" else self.color(None)
            self.draw.rounded_rectangle(
                [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE],
                radius=(h / 2) * SCALE,
                fill=bg,
            )
            font = get_font("system", 11, 600)
            label = f"↻ {node.get('title') or ''}" if node_type == "refreshButton" else str(node.get("title") or "")
            self.draw.text(((x + 9) * SCALE, (y + 5) * SCALE), label, font=font, fill=fg)


def render(snapshot_path: Path) -> Path:
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    width = payload["width"]
    height = payload["height"]
    appearance = payload.get("appearance", "light")
    bg_color = (24, 24, 26, 255) if appearance == "dark" else (245, 245, 247, 255)
    canvas = Image.new("RGBA", (width * SCALE, height * SCALE), bg_color)
    renderer = FrameRenderer(canvas, appearance=appearance)
    renderer.render_node(payload["tree"], is_root=True)
    renderer.composite()
    output = snapshot_path.with_suffix(".png")
    canvas.save(output)
    return output


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        result = render(Path(arg))
        print(result)
