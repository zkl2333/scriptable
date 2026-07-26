"""将 snapshot-widgets.mjs 导出的完整 IR 树渲染为 PNG（简化布局引擎）。

用法：python scripts/render-widget.py snapshots/pixel-pet-medium.json [...]
仅用于离线视觉检查，布局为近似实现，可能与真实 preview/Scriptable 存在偏差。
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCALE = 3
FLEX_SPACER_MIN = 8
DEFAULT_LINE_RATIO = 1.3

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
    key = (family, round(size * SCALE), weight)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(
            str(_font_path(family, weight)), round(size * SCALE)
        )
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


def gradient_array(gradient, width: int, height: int) -> np.ndarray:
    colors = gradient.get("colors") or [{"hex": "#FFFFFF", "alpha": 1}]
    locations = gradient.get("locations") or list(
        np.linspace(0, 1, len(colors))
    )
    start = gradient.get("startPoint") or {"x": 0, "y": 0}
    end = gradient.get("endPoint") or {"x": 0, "y": 1}
    xs, ys = np.meshgrid(np.arange(width), np.arange(height))
    dx, dy = end["x"] - start["x"], end["y"] - start["y"]
    denom = dx * dx + dy * dy or 1
    t = (((xs / max(width - 1, 1)) - start["x"]) * dx
         + ((ys / max(height - 1, 1)) - start["y"]) * dy) / denom
    t = np.clip(t, 0, 1)
    rgba = np.array([parse_color(c) for c in colors], dtype=float)
    locs = np.array(locations, dtype=float)
    out = np.zeros((height, width, 4))
    for channel in range(4):
        out[:, :, channel] = np.interp(t, locs, rgba[:, channel])
    return out.astype(np.uint8)


def render_draw_ops(ops, box, draw: ImageDraw.ImageDraw, natural_size=None):
    """把 DrawContext ops 画进 box（按 natural_size 等比缩放）。"""
    sx = box[2] / (natural_size["width"] if natural_size else box[2])
    sy = box[3] / (natural_size["height"] if natural_size else box[3])
    for op in ops or []:
        color = parse_color(op.get("color"))
        rect = op.get("rect")
        if not rect:
            continue
        x0 = box[0] + rect["x"] * sx
        y0 = box[1] + rect["y"] * sy
        x1 = x0 + rect["width"] * sx
        y1 = y0 + rect["height"] * sy
        if op["type"] in ("fillRect", "fill"):
            draw.rectangle([x0, y0, x1, y1], fill=color)
        elif op["type"] == "fillEllipse":
            draw.ellipse([x0, y0, x1, y1], fill=color)
        elif op["type"] == "roundedRect":
            radius = (op.get("cornerWidth") or 0) * sx
            draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=color)
        elif op["type"] == "strokeRect":
            draw.rectangle([x0, y0, x1, y1], outline=color)


class Measurer:
    def __init__(self):
        self._probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))

    def text_width(self, text: str, font) -> float:
        return self._probe.textlength(text, font=font) / SCALE


def padding_of(node) -> tuple:
    pad = node.get("padding")
    if not pad:
        return (0, 0, 0, 0)
    if isinstance(pad, dict):
        return (
            pad.get("top") or 0,
            pad.get("left") or 0,
            pad.get("bottom") or 0,
            pad.get("right") or 0,
        )
    return tuple(pad)  # top, left, bottom, right


class Renderer:
    def __init__(self, image: Image.Image, appearance="light"):
        self.image = image
        # 所有绘制先入透明覆盖层，结束后整体 alpha_composite，
        # 避免半透明颜色直接替换像素导致灰条纹等失真。
        self.overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.overlay)
        self.measurer = Measurer()
        self.appearance = appearance

    def composite(self):
        self.image.alpha_composite(self.overlay)

    def color(self, value, default=(0, 0, 0, 255)):
        return parse_color(value, self.appearance, default)

    # ---------------- 测量 ----------------
    def measure(self, node, avail_w: float) -> tuple:
        """返回 (宽, 高)，spacer 弹性时主轴长度返回 None 占位由父级处理。"""
        node_type = node["type"]
        if node_type in ("text", "date"):
            styling = node.get("styling") or {}
            font_info = styling.get("font") or {}
            size = font_info.get("size") or 12
            weight = font_info.get("weight") or 400
            family = font_info.get("family") or "system"
            font = get_font(family, size, weight)
            text = node.get("text") or node.get("date") or ""
            width = self.measurer.text_width(text, font)
            return (min(width, avail_w), size * DEFAULT_LINE_RATIO)
        if node_type == "image":
            size = node.get("imageSize")
            natural = (node.get("codableImage") or {}).get("size")
            if size and size.get("width") and size.get("height"):
                return (size["width"], size["height"])
            if size and size.get("width") and natural:
                ratio = natural["height"] / natural["width"]
                return (size["width"], size["width"] * ratio)
            if natural:
                return (natural["width"], natural["height"])
            return (16, 16)
        if node_type == "spacer":
            return (None, None)
        if node_type == "stack":
            top, left, bottom, right = padding_of(node)
            inner_w = max(0.0, avail_w - left - right)
            horizontal = node.get("contentDirection") != "vertical"
            gap = node.get("spacing") or 0
            children = node.get("elements") or []
            sizes = [self.measure(child, inner_w) for child in children]
            if horizontal:
                width = sum(s[0] or 0 for s in sizes) + gap * max(0, len(sizes) - 1)
                height = max((s[1] or 0 for s in sizes), default=0)
            else:
                width = max((s[0] or 0 for s in sizes), default=0)
                height = sum(s[1] or 0 for s in sizes) + gap * max(0, len(sizes) - 1)
            return (width + left + right, height + top + bottom)
        return (0, 0)

    # ---------------- 绘制 ----------------
    def render_background(self, node, box):
        x, y, w, h = box
        if w <= 0 or h <= 0:
            return
        gradient = node.get("backgroundGradient")
        if gradient and gradient.get("colors"):
            array = gradient_array(gradient, max(1, round(w)), max(1, round(h)))
            patch = Image.fromarray(array, "RGBA").resize(
                (round(w * SCALE), round(h * SCALE)), Image.NEAREST
            )
            self.image.paste(patch, (round(x * SCALE), round(y * SCALE)), patch)
        elif node.get("backgroundColor"):
            self.draw.rectangle(
                [x * SCALE, y * SCALE, (x + w) * SCALE, (y + h) * SCALE],
                fill=self.color(node["backgroundColor"]),
            )
        background_image = node.get("backgroundImage")
        if background_image and background_image.get("kind") == "draw":
            render_draw_ops(
                background_image.get("ops"),
                (x * SCALE, y * SCALE, w * SCALE, h * SCALE),
                self.draw,
                background_image.get("size"),
            )

    def render_container(self, node, box):
        """box = (x, y, w, h)，单位为逻辑像素。"""
        self.render_background(node, box)
        x, y, w, h = box
        top, left, bottom, right = padding_of(node)
        ix, iy = x + left, y + top
        iw, ih = max(0.0, w - left - right), max(0.0, h - top - bottom)
        horizontal = node.get("contentDirection") != "vertical"
        gap = node.get("spacing") or 0
        alignment = node.get("alignment")
        children = node.get("elements") or []
        if not children:
            return

        cross = iw if horizontal else ih
        main_avail = ih if not horizontal else iw
        sizes = [self.measure(child, cross if horizontal else iw) for child in children]
        mains = []
        flex_indexes = []
        for index, (child, size) in enumerate(zip(children, sizes)):
            if child["type"] == "spacer" and child.get("length") is None:
                mains.append(None)
                flex_indexes.append(index)
            elif child["type"] == "spacer":
                mains.append(float(child.get("length") or 0))
            else:
                mains.append(size[0] if horizontal else size[1])

        fixed_total = sum(m for m in mains if m is not None) + gap * max(0, len(mains) - 1)
        remaining = max(0.0, main_avail - fixed_total)
        flex_length = remaining / len(flex_indexes) if flex_indexes else 0.0
        if flex_indexes and flex_length < FLEX_SPACER_MIN and main_avail >= fixed_total + FLEX_SPACER_MIN * len(flex_indexes):
            flex_length = FLEX_SPACER_MIN
        mains = [flex_length if m is None else m for m in mains]

        used = sum(mains) + gap * max(0, len(mains) - 1)
        offset = 0.0
        # 纵向 stack 的 centerAlignContent → 主轴居中
        if not horizontal and alignment == "center" and not flex_indexes:
            offset = max(0.0, (main_avail - used) / 2)
        # 根 list 或含弹性 Spacer 时不做主轴居中

        cursor = (ix if horizontal else iy) + offset
        for child, main, size in zip(children, mains, sizes):
            if horizontal:
                child_w = main
                child_h = size[1] if child["type"] != "spacer" else 0
                cy = iy + (ih - child_h) / 2 if alignment == "center" else iy
                self.render_child(child, (cursor, cy, child_w, child_h or ih), iw)
                cursor += child_w + gap
            else:
                child_h = main
                child_w = size[0] if child["type"] != "spacer" else 0
                self.render_child(child, (ix, cursor, iw, child_h), iw, child_w)
                cursor += child_h + gap

    def render_child(self, node, box, avail_w, measured_w=None):
        node_type = node["type"]
        if node_type == "spacer":
            return
        x, y, w, h = box
        if node_type in ("text", "date"):
            styling = node.get("styling") or {}
            font_info = styling.get("font") or {}
            size = font_info.get("size") or 12
            weight = font_info.get("weight") or 400
            family = font_info.get("family") or "system"
            font = get_font(family, size, weight)
            text = node.get("text") or node.get("date") or ""
            color = self.color(styling.get("textColor"))
            text_w = self.measurer.text_width(text, font)
            align = node.get("horizontalTextAlignment") or "left"
            tx = x
            if align == "center":
                tx = x + max(0.0, (w - text_w) / 2)
            elif align == "right":
                tx = x + max(0.0, w - text_w)
            self.draw.text(
                (tx * SCALE, y * SCALE), text, font=font, fill=color
            )
            return
        if node_type == "image":
            mw, mh = self.measure(node, avail_w)
            align = node.get("imageAlignment") or "left"
            ix = x
            if align == "center":
                ix = x + max(0.0, (w - mw) / 2)
            elif align == "right":
                ix = x + max(0.0, w - mw)
            codable = node.get("codableImage") or {}
            if codable.get("kind") == "draw":
                render_draw_ops(
                    codable.get("ops"),
                    (ix * SCALE, y * SCALE, mw * SCALE, mh * SCALE),
                    self.draw,
                    codable.get("size"),
                )
            return
        if node_type == "stack":
            mw, mh = self.measure(node, w)
            # 纵向容器中的子 stack 占满交叉轴宽度
            self.render_container(node, (x, y, w, min(h, mh)))


def render(snapshot_path: Path) -> Path:
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    width = payload["width"]
    height = payload["height"]
    canvas = Image.new("RGBA", (width * SCALE, height * SCALE), (255, 255, 255, 255))
    renderer = Renderer(canvas)
    tree = payload["tree"]
    # 根 list：默认 padding 已由组件 setPadding 决定，无 padding 时 Scriptable 默认 16
    if tree.get("padding") is None:
        tree = {**tree, "padding": {"top": 16, "left": 16, "bottom": 16, "right": 16}}
    renderer.render_container(tree, (0, 0, width, height))
    renderer.composite()
    output = snapshot_path.with_suffix(".png")
    canvas.save(output)
    return output


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        result = render(Path(arg))
        print(result)
