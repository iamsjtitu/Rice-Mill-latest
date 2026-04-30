"""Regression tests for v104.44.5 — All-Trucks Per-Trip Bhada PDF/Excel exports.

Endpoints under test:
  GET /api/truck-owner/per-trip-all/pdf?[kms_year=&season=&filter_status=&trans_type=&search=]
  GET /api/truck-owner/per-trip-all/excel?[…]

Validates HTTP 200, content-type, non-trivial size, and filter combinations.
"""
import os
import requests
import pytest

API_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://paddy-ledger-1.preview.emergentagent.com")
PDF = f"{API_URL}/api/truck-owner/per-trip-all/pdf"
XLS = f"{API_URL}/api/truck-owner/per-trip-all/excel"

PDF_TYPE = "application/pdf"
XLS_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.mark.parametrize("query,min_size", [
    ("", 5000),
    ("filter_status=pending", 4000),
    ("filter_status=partial", 4000),
    ("filter_status=settled", 4000),
    ("trans_type=sale", 4000),
    ("trans_type=purchase", 4000),
    ("search=DEMO", 4000),
    ("filter_status=pending&trans_type=sale", 4000),
    ("filter_status=pending&trans_type=purchase&search=OD", 4000),
])
def test_pertrip_all_pdf(query, min_size):
    r = requests.get(f"{PDF}?{query}", timeout=20)
    assert r.status_code == 200, f"PDF [{query}] HTTP={r.status_code}: {r.text[:200]}"
    assert PDF_TYPE in r.headers.get("content-type", ""), f"Wrong type: {r.headers.get('content-type')}"
    assert len(r.content) >= min_size, f"PDF too small: {len(r.content)} bytes"
    # Sanity: %PDF magic bytes
    assert r.content[:4] == b"%PDF", "Not a valid PDF"


@pytest.mark.parametrize("query,min_size", [
    ("", 3000),
    ("filter_status=pending", 3000),
    ("filter_status=settled", 3000),
    ("trans_type=sale", 3000),
    ("search=DEMO", 3000),
    ("filter_status=partial&trans_type=purchase", 3000),
])
def test_pertrip_all_excel(query, min_size):
    r = requests.get(f"{XLS}?{query}", timeout=20)
    assert r.status_code == 200, f"Excel [{query}] HTTP={r.status_code}: {r.text[:200]}"
    assert XLS_TYPE in r.headers.get("content-type", ""), f"Wrong type: {r.headers.get('content-type')}"
    assert len(r.content) >= min_size, f"Excel too small: {len(r.content)} bytes"
    # Sanity: XLSX zip magic bytes (PK\x03\x04)
    assert r.content[:2] == b"PK", "Not a valid xlsx"


def test_pertrip_all_filename_reflects_filter():
    """Filename should embed filter_status when applied."""
    r = requests.get(f"{PDF}?filter_status=pending", timeout=20)
    assert r.status_code == 200
    cd = r.headers.get("content-disposition", "")
    assert "per_trip_bhada_all_trucks_pending.pdf" in cd, f"Bad filename: {cd}"

    r2 = requests.get(PDF, timeout=20)
    assert r2.status_code == 200
    cd2 = r2.headers.get("content-disposition", "")
    assert "per_trip_bhada_all_trucks.pdf" in cd2, f"Bad filename: {cd2}"


def test_pertrip_all_search_unmatched_returns_empty():
    """Search for non-existent string should still return a valid PDF (with empty table)."""
    r = requests.get(f"{PDF}?search=ZZZZZNOMATCH", timeout=20)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
