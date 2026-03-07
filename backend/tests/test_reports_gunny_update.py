"""
Testing for Mill Entry System - Iteration 16
Focus:
1. Updated Gunny Bags module - paddy_bags, ppkt, g_issued from truck entries
2. New Reports module - CMR vs DC and Season P&L reports with Excel/PDF exports
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ============ GUNNY BAGS SUMMARY - UPDATED ============

class TestGunnyBagsSummaryUpdated:
    """Verify gunny-bags/summary now includes paddy_bags, ppkt, g_issued from truck entries"""

    def test_gunny_summary_has_paddy_bags_field(self, api_client):
        """GET /api/gunny-bags/summary should have paddy_bags.total"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "paddy_bags" in data, "paddy_bags field missing from summary"
        assert "total" in data["paddy_bags"], "paddy_bags.total missing"
        assert isinstance(data["paddy_bags"]["total"], (int, float)), "paddy_bags.total should be numeric"
        print(f"paddy_bags.total = {data['paddy_bags']['total']}")

    def test_gunny_summary_has_ppkt_field(self, api_client):
        """GET /api/gunny-bags/summary should have ppkt.total (plastic bags)"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        data = response.json()
        assert "ppkt" in data, "ppkt field missing from summary"
        assert "total" in data["ppkt"], "ppkt.total missing"
        assert isinstance(data["ppkt"]["total"], (int, float)), "ppkt.total should be numeric"
        print(f"ppkt.total = {data['ppkt']['total']}")

    def test_gunny_summary_has_g_issued_field(self, api_client):
        """GET /api/gunny-bags/summary should have g_issued.total"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        data = response.json()
        assert "g_issued" in data, "g_issued field missing from summary"
        assert "total" in data["g_issued"], "g_issued.total missing"
        assert isinstance(data["g_issued"]["total"], (int, float)), "g_issued.total should be numeric"
        print(f"g_issued.total = {data['g_issued']['total']}")

    def test_grand_total_excludes_govt_bags(self, api_client):
        """grand_total should = old.balance + paddy_bags + ppkt (govt NOT included)"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        data = response.json()
        
        old_balance = data.get("old", {}).get("balance", 0)
        paddy_bags_total = data.get("paddy_bags", {}).get("total", 0)
        ppkt_total = data.get("ppkt", {}).get("total", 0)
        new_balance = data.get("new", {}).get("balance", 0)  # govt bags
        grand_total = data.get("grand_total", 0)
        
        expected_grand_total = old_balance + paddy_bags_total + ppkt_total
        assert grand_total == expected_grand_total, f"grand_total {grand_total} != {expected_grand_total} (old.balance + paddy_bags + ppkt)"
        print(f"grand_total={grand_total}, old={old_balance}, paddy_bags={paddy_bags_total}, ppkt={ppkt_total}, govt(excluded)={new_balance}")

    def test_gunny_summary_has_new_and_old_bag_types(self, api_client):
        """Summary should still have new (govt) and old (market) bags"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary")
        assert response.status_code == 200
        data = response.json()
        
        assert "new" in data, "new bag type missing"
        assert "old" in data, "old bag type missing"
        for bt in ["new", "old"]:
            assert "total_in" in data[bt], f"{bt}.total_in missing"
            assert "total_out" in data[bt], f"{bt}.total_out missing"
            assert "balance" in data[bt], f"{bt}.balance missing"
            assert "total_cost" in data[bt], f"{bt}.total_cost missing"


class TestGunnyBagsExports:
    """Test gunny bags Excel/PDF exports"""

    def test_gunny_excel_export(self, api_client):
        """GET /api/gunny-bags/excel should return xlsx"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type.lower() or len(response.content) > 0
        print(f"Gunny Excel export: {len(response.content)} bytes")

    def test_gunny_pdf_export(self, api_client):
        """GET /api/gunny-bags/pdf should return pdf"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or response.content[:4] == b'%PDF'
        print(f"Gunny PDF export: {len(response.content)} bytes")


# ============ REPORTS MODULE - CMR vs DC ============

class TestCMRvsDCReport:
    """Test new CMR vs DC comparison report"""

    def test_cmr_vs_dc_returns_milling_data(self, api_client):
        """GET /api/reports/cmr-vs-dc should return milling section"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "milling" in data, "milling field missing"
        m = data["milling"]
        assert "total_paddy_milled" in m, "total_paddy_milled missing"
        assert "total_rice_produced" in m, "total_rice_produced missing"
        assert "total_frk_used" in m, "total_frk_used missing"
        assert "total_cmr_ready" in m, "total_cmr_ready missing"
        assert "avg_outturn_pct" in m, "avg_outturn_pct missing"
        assert "milling_count" in m, "milling_count missing"
        print(f"Milling: {m}")

    def test_cmr_vs_dc_returns_dc_data(self, api_client):
        """GET /api/reports/cmr-vs-dc should return dc section"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200
        data = response.json()
        
        assert "dc" in data, "dc field missing"
        d = data["dc"]
        assert "total_allotted" in d, "total_allotted missing"
        assert "total_delivered" in d, "total_delivered missing"
        assert "total_pending" in d, "total_pending missing"
        assert "dc_count" in d, "dc_count missing"
        assert "delivery_count" in d, "delivery_count missing"
        print(f"DC: {d}")

    def test_cmr_vs_dc_returns_comparison(self, api_client):
        """GET /api/reports/cmr-vs-dc should return comparison section"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200
        data = response.json()
        
        assert "comparison" in data, "comparison field missing"
        c = data["comparison"]
        assert "cmr_vs_dc_allotted" in c, "cmr_vs_dc_allotted missing"
        assert "cmr_vs_dc_delivered" in c, "cmr_vs_dc_delivered missing"
        print(f"Comparison: {c}")

    def test_cmr_vs_dc_returns_byproduct_revenue(self, api_client):
        """GET /api/reports/cmr-vs-dc should return byproduct_revenue"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc")
        assert response.status_code == 200
        data = response.json()
        
        assert "byproduct_revenue" in data, "byproduct_revenue field missing"
        assert isinstance(data["byproduct_revenue"], (int, float)), "byproduct_revenue should be numeric"
        print(f"Byproduct Revenue: {data['byproduct_revenue']}")

    def test_cmr_vs_dc_excel_export(self, api_client):
        """GET /api/reports/cmr-vs-dc/excel should return xlsx"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type.lower() or len(response.content) > 0
        print(f"CMR vs DC Excel: {len(response.content)} bytes")

    def test_cmr_vs_dc_pdf_export(self, api_client):
        """GET /api/reports/cmr-vs-dc/pdf should return pdf"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or response.content[:4] == b'%PDF'
        print(f"CMR vs DC PDF: {len(response.content)} bytes")


# ============ REPORTS MODULE - SEASON P&L ============

class TestSeasonPnLReport:
    """Test new Season P&L report"""

    def test_season_pnl_returns_income_section(self, api_client):
        """GET /api/reports/season-pnl should return income section"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "income" in data, "income field missing"
        inc = data["income"]
        assert "msp_payments" in inc, "income.msp_payments missing"
        assert "byproduct_sales" in inc, "income.byproduct_sales missing"
        assert "cash_book_jama" in inc, "income.cash_book_jama missing"
        assert "total" in inc, "income.total missing"
        print(f"Income: {inc}")

    def test_season_pnl_returns_expenses_section(self, api_client):
        """GET /api/reports/season-pnl should return expenses section"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl")
        assert response.status_code == 200
        data = response.json()
        
        assert "expenses" in data, "expenses field missing"
        exp = data["expenses"]
        assert "frk_purchases" in exp, "expenses.frk_purchases missing"
        assert "gunny_bags" in exp, "expenses.gunny_bags missing"
        assert "cash_book_nikasi" in exp, "expenses.cash_book_nikasi missing"
        assert "truck_payments" in exp, "expenses.truck_payments missing"
        assert "agent_payments" in exp, "expenses.agent_payments missing"
        assert "total" in exp, "expenses.total missing"
        print(f"Expenses: {exp}")

    def test_season_pnl_returns_net_pnl_and_profit(self, api_client):
        """GET /api/reports/season-pnl should return net_pnl and profit fields"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl")
        assert response.status_code == 200
        data = response.json()
        
        assert "net_pnl" in data, "net_pnl field missing"
        assert "profit" in data, "profit field missing"
        assert isinstance(data["net_pnl"], (int, float)), "net_pnl should be numeric"
        assert isinstance(data["profit"], bool), "profit should be boolean"
        print(f"Net P&L: {data['net_pnl']}, Profit: {data['profit']}")

    def test_season_pnl_excel_export(self, api_client):
        """GET /api/reports/season-pnl/excel should return xlsx"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type or "xlsx" in content_type.lower() or len(response.content) > 0
        print(f"Season P&L Excel: {len(response.content)} bytes")

    def test_season_pnl_pdf_export(self, api_client):
        """GET /api/reports/season-pnl/pdf should return pdf"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or response.content[:4] == b'%PDF'
        print(f"Season P&L PDF: {len(response.content)} bytes")


# ============ KMS YEAR FILTER TESTS ============

class TestKMSYearFilters:
    """Test that endpoints work with KMS year and season filters"""

    def test_gunny_summary_with_kms_filter(self, api_client):
        """Gunny summary should work with kms_year filter"""
        response = api_client.get(f"{BASE_URL}/api/gunny-bags/summary?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert "grand_total" in data
        print(f"Gunny summary with filter: {data['grand_total']} total bags")

    def test_cmr_vs_dc_with_kms_filter(self, api_client):
        """CMR vs DC should work with kms_year filter"""
        response = api_client.get(f"{BASE_URL}/api/reports/cmr-vs-dc?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert "milling" in data
        assert "dc" in data
        print("CMR vs DC with filter works")

    def test_season_pnl_with_kms_filter(self, api_client):
        """Season P&L should work with kms_year filter"""
        response = api_client.get(f"{BASE_URL}/api/reports/season-pnl?kms_year=2024-2025&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert "income" in data
        assert "expenses" in data
        print("Season P&L with filter works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
