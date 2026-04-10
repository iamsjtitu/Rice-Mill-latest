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
    """Draw watermark on a single reportlab page (called via onPage)."""
    settings = get_cached_watermark()
    if not settings or not settings.get("enabled"):
        return

    canvas.saveState()
    opacity = float(settings.get("opacity", 0.06))
    wm_type = settings.get("type", "text")

    if wm_type == "text":
        text = settings.get("text", "")
        if text:
            font_size = int(settings.get("font_size", 52))
            rotation = int(settings.get("rotation", 45))
            canvas.setFillAlpha(opacity)
            try:
                canvas.setFont("FreeSansBold", font_size)
            except Exception:
                canvas.setFont("Helvetica-Bold", font_size)
            canvas.setFillColorRGB(0.6, 0.6, 0.6)
            w = doc_template.pagesize[0] if hasattr(doc_template, 'pagesize') else 595
            h = doc_template.pagesize[1] if hasattr(doc_template, 'pagesize') else 842
            canvas.translate(w / 2, h / 2)
            canvas.rotate(rotation)
            canvas.drawCentredString(0, 0, text)

    elif wm_type == "image":
        img_path = settings.get("image_path", "")
        if img_path and os.path.exists(img_path):
            canvas.setFillAlpha(opacity)
            w = doc_template.pagesize[0] if hasattr(doc_template, 'pagesize') else 595
            h = doc_template.pagesize[1] if hasattr(doc_template, 'pagesize') else 842
            img_w, img_h = 200, 200
            try:
                canvas.drawImage(
                    img_path,
                    (w - img_w) / 2, (h - img_h) / 2,
                    img_w, img_h,
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
                draw_watermark_on_page(canvas, doc)
                if orig_first:
                    orig_first(canvas, doc)

            def wm_later(canvas, doc):
                draw_watermark_on_page(canvas, doc)
                if orig_later:
                    orig_later(canvas, doc)

            _original_build(self, flowables, onFirstPage=wm_first, onLaterPages=wm_later, **build_kwargs)
        else:
            build_args = {}
            if onFirstPage is not None:
                build_args['onFirstPage'] = onFirstPage
            if onLaterPages is not None:
                build_args['onLaterPages'] = onLaterPages
            _original_build(self, flowables, **build_args, **build_kwargs)

    SimpleDocTemplate.build = _patched_build
