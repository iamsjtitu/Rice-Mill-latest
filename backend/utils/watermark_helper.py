"""
Global PDF Watermark Helper
- Cached settings from DB (app_settings.setting_id="watermark")
- draw_watermark_on_page() for reportlab canvas
- patch_simpledoctemplate() monkey-patches SimpleDocTemplate.build
  so ALL existing doc.build(elements) calls auto-apply watermark
"""
import os
from database import db

_wm_cache = {"settings": None}


async def load_watermark_settings():
    """Load from DB into cache. Call at startup + after settings update."""
    doc = await db.app_settings.find_one({"setting_id": "watermark"}, {"_id": 0})
    _wm_cache["settings"] = doc or {"enabled": False}
    return _wm_cache["settings"]


def get_cached_watermark():
    return _wm_cache["settings"] or {"enabled": False}


def draw_watermark_on_page(canvas, doc_template):
    """Draw tiled watermark across entire page (called via onPage)."""
    settings = get_cached_watermark()
    if not settings or not settings.get("enabled"):
        return

    canvas.saveState()
    opacity = float(settings.get("opacity", 0.06))
    wm_type = settings.get("type", "text")
    w = doc_template.pagesize[0] if hasattr(doc_template, 'pagesize') else 595
    h = doc_template.pagesize[1] if hasattr(doc_template, 'pagesize') else 842

    if wm_type == "text":
        text = settings.get("text", "")
        if text:
            font_size = int(settings.get("font_size", 52))
            rotation = int(settings.get("rotation", 45))
            # Convert watermark text to image tiles (non-selectable, no backslash on click)
            import math
            from PIL import Image, ImageDraw, ImageFont
            from io import BytesIO as PILBytesIO
            from reportlab.lib.utils import ImageReader

            # Create a single watermark tile image with text
            scale = 2  # higher res
            try:
                pil_font = ImageFont.truetype("/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", font_size * scale)
            except Exception:
                try:
                    pil_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size * scale)
                except Exception:
                    pil_font = ImageFont.load_default()

            # Measure text
            dummy_img = Image.new('RGBA', (1, 1), (0, 0, 0, 0))
            dummy_draw = ImageDraw.Draw(dummy_img)
            bbox = dummy_draw.textbbox((0, 0), text, font=pil_font)
            txt_w = bbox[2] - bbox[0] + 20 * scale
            txt_h = bbox[3] - bbox[1] + 10 * scale

            # Draw text on transparent image
            txt_img = Image.new('RGBA', (txt_w, txt_h), (0, 0, 0, 0))
            txt_draw = ImageDraw.Draw(txt_img)
            alpha_val = max(1, min(255, int(255 * opacity * 1.5)))
            txt_draw.text((10 * scale, 2 * scale), text, fill=(153, 153, 153, alpha_val), font=pil_font)

            # Rotate
            rot_img = txt_img.rotate(rotation, expand=True, resample=Image.BICUBIC)
            tile_w = rot_img.width / scale
            tile_h = rot_img.height / scale

            # Save to bytes
            img_buf = PILBytesIO()
            rot_img.save(img_buf, format='PNG')
            img_buf.seek(0)
            img_reader = ImageReader(img_buf)

            # Tile across page
            step_x = max(tile_w * 0.85, 200)
            step_y = max(tile_h * 0.85, 150)
            for py in range(int(-tile_h), int(h + tile_h), int(step_y)):
                for px in range(int(-tile_w * 0.3), int(w + tile_w), int(step_x)):
                    try:
                        canvas.drawImage(img_reader, px, py, tile_w, tile_h, mask='auto')
                    except Exception:
                        pass

    elif wm_type == "image":
        img_path = settings.get("image_path", "")
        if img_path and os.path.exists(img_path):
            canvas.setFillAlpha(opacity)
            img_w, img_h = 150, 150
            step_x, step_y = 250, 250
            for y in range(0, int(h), step_y):
                for x in range(0, int(w), step_x):
                    try:
                        canvas.drawImage(
                            img_path, x, y, img_w, img_h,
                            preserveAspectRatio=True, mask='auto'
                        )
                    except Exception:
                        pass

    canvas.restoreState()


def patch_simpledoctemplate():
    """Monkey-patch SimpleDocTemplate.build to auto-apply watermark.
    Call ONCE at server startup. All existing doc.build() calls
    will automatically include watermark — zero route changes needed."""
    from reportlab.platypus import SimpleDocTemplate
    _original_build = SimpleDocTemplate.build

    def _patched_build(self, flowables, onFirstPage=None, onLaterPages=None, canvasmaker=None, **kwargs):
        settings = get_cached_watermark()
        build_kwargs = dict(**kwargs)
        if canvasmaker is not None:
            build_kwargs['canvasmaker'] = canvasmaker

        # Per-document opt-out: doc._skip_watermark = True disables watermark for this specific PDF
        skip_watermark = getattr(self, "_skip_watermark", False)
        if settings and settings.get("enabled") and not skip_watermark:
            orig_first = onFirstPage
            orig_later = onLaterPages

            def wm_first(canvas, doc):
                if orig_first:
                    orig_first(canvas, doc)
                draw_watermark_on_page(canvas, doc)

            def wm_later(canvas, doc):
                if orig_later:
                    orig_later(canvas, doc)
                draw_watermark_on_page(canvas, doc)

            _original_build(self, flowables, onFirstPage=wm_first, onLaterPages=wm_later, **build_kwargs)
        else:
            build_args = {}
            if onFirstPage is not None:
                build_args['onFirstPage'] = onFirstPage
            if onLaterPages is not None:
                build_args['onLaterPages'] = onLaterPages
            _original_build(self, flowables, **build_args, **build_kwargs)

    SimpleDocTemplate.build = _patched_build
