"""
v104.44.95 — Oil Premium lookup-sale test with Party Weight merge

Validates that GET /api/oil-premium/lookup-sale returns `party_weight_qtl` and
`party_weight_exists` fields so the New Oil Premium form can auto-fill Party W
and use it as Qty.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def test_lookup_with_party_weight_exists():
    """S-002 in kms_year 2026-2027 has party_weight entry (14500 kg → 145 Qtl)."""
    r = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale",
                     params={"voucher_no": "S-002", "kms_year": "2026-2027"},
                     timeout=10)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    data = r.json()
    assert "party_weight_qtl" in data, "Missing party_weight_qtl field"
    assert "party_weight_exists" in data, "Missing party_weight_exists field"
    assert data["party_weight_exists"] is True
    assert data["party_weight_qtl"] == 145.0
    assert data["voucher_no"] == "S-002"


def test_lookup_without_party_weight():
    """S-001 has NO party_weight entry — should return 0 and exists=False."""
    r = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale",
                     params={"voucher_no": "S-001", "kms_year": "2026-2027"},
                     timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["party_weight_exists"] is False
    assert data["party_weight_qtl"] == 0


def test_lookup_by_rst_merges_party_weight():
    """RST=6 → S-002 → party_weight_qtl should still be 145."""
    r = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale",
                     params={"rst_no": "6", "kms_year": "2026-2027"},
                     timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data["voucher_no"] == "S-002"
    assert data["party_weight_qtl"] == 145.0
    assert data["party_weight_exists"] is True


def test_lookup_not_found_preserves_404():
    """Non-existent voucher should still 404."""
    r = requests.get(f"{BASE_URL}/api/oil-premium/lookup-sale",
                     params={"voucher_no": "S-NONEXISTENT-999"},
                     timeout=10)
    assert r.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
