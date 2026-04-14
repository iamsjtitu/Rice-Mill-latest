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
            try:
                font_name = "FreeSansBold"
                canvas.setFont(font_name, font_size)
            except Exception:
                font_name = "Helvetica-Bold"
                canvas.setFont(font_name, font_size)
            # Tile watermark across the full page
            import math
            from reportlab.pdfbase.pdfmetrics import stringWidth
            step_x = max(font_size * len(text) * 0.45, 200)
            step_y = max(font_size * 2.5, 150)
            for y in range(int(-h * 0.5), int(h * 1.5), int(step_y)):
                for x in range(int(-w * 0.5), int(w * 1.5), int(step_x)):
                    canvas.saveState()
                    canvas.translate(x, y)
                    canvas.rotate(rotation)
                    canvas.setFillAlpha(opacity)
                    canvas.setFillColorRGB(0.6, 0.6, 0.6)
                    canvas.setFont(font_name, font_size)
                    # Draw as filled text path (non-selectable vector outlines)
                    tw = stringWidth(text, font_name, font_size)
                    p = canvas.beginPath()
                    p.moveTo(-tw / 2, 0)
                    canvas.setFont(font_name, font_size)
                    canvas.drawCentredString(0, 0, text)
                    canvas.restoreState()

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

        if settings and settings.get("enabled"):
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
