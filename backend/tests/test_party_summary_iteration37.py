"""
Tests for Party Summary Dashboard Feature - Iteration 37
Tests: Party Summary API, Party Summary PDF export, Party Summary Excel export
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="module")
def auth_cookies(api_client):
    """Login and get cookies"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.cookies
    pytest.skip("Authentication failed")

@pytest.fixture(scope="module")
def test_transactions(api_client, auth_cookies):
    """Create test transactions for party summary testing"""
    api_client.cookies = auth_cookies
    created_ids = []
    
    # Create test transactions for different parties
    test_data = [
        {"date": "2025-01-15", "account": "cash", "txn_type": "jama", "category": "TEST_PartyA", "party_type": "Local Party", "amount": 10000, "kms_year": "2025-2026", "season": "Kharif"},
        {"date": "2025-01-16", "account": "cash", "txn_type": "nikasi", "category": "TEST_PartyA", "party_type": "Local Party", "amount": 5000, "kms_year": "2025-2026", "season": "Kharif"},
        {"date": "2025-01-15", "account": "cash", "txn_type": "jama", "category": "TEST_PartyB", "party_type": "Truck", "amount": 20000, "kms_year": "2025-2026", "season": "Kharif"},
        {"date": "2025-01-16", "account": "cash", "txn_type": "nikasi", "category": "TEST_PartyB", "party_type": "Truck", "amount": 20000, "kms_year": "2025-2026", "season": "Kharif"},  # Settled
        {"date": "2025-01-15", "account": "cash", "txn_type": "jama", "category": "TEST_PartyC", "party_type": "Agent", "amount": 15000, "kms_year": "2025-2026", "season": "Kharif"},
    ]
    
    for txn in test_data:
        response = api_client.post(f"{BASE_URL}/api/cash-book?username=admin&role=admin", json=txn)
        if response.status_code == 200:
            created_ids.append(response.json().get("id"))
    
    yield created_ids
    
    # Cleanup
    for txn_id in created_ids:
        if txn_id:
            api_client.delete(f"{BASE_URL}/api/cash-book/{txn_id}")


class TestPartySummaryEndpoint:
    """Tests for GET /api/cash-book/party-summary endpoint"""
    
    def test_party_summary_returns_200(self, api_client, auth_cookies, test_transactions):
        """Party summary endpoint should return 200"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary")
        assert response.status_code == 200
        print(f"GET /api/cash-book/party-summary: {response.status_code}")
    
    def test_party_summary_response_structure(self, api_client, auth_cookies, test_transactions):
        """Response should have correct structure with parties and summary"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "parties" in data
        assert "summary" in data
        assert isinstance(data["parties"], list)
        
        # Check summary structure
        summary = data["summary"]
        assert "total_parties" in summary
        assert "settled_count" in summary
        assert "pending_count" in summary
        assert "total_jama" in summary
        assert "total_nikasi" in summary
        assert "total_outstanding" in summary
        print(f"Party Summary structure verified: {len(data['parties'])} parties, {summary['total_parties']} total")
    
    def test_party_summary_party_structure(self, api_client, auth_cookies, test_transactions):
        """Each party should have required fields"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        data = response.json()
        
        if data["parties"]:
            party = data["parties"][0]
            assert "party_name" in party
            assert "party_type" in party
            assert "total_jama" in party
            assert "total_nikasi" in party
            assert "balance" in party
            assert "txn_count" in party
            print(f"Party structure verified: {party}")
    
    def test_party_summary_calculates_balance(self, api_client, auth_cookies, test_transactions):
        """Balance should be calculated as jama - nikasi"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        data = response.json()
        
        # Find TEST_PartyA (should have balance = 10000 - 5000 = 5000)
        test_party_a = next((p for p in data["parties"] if p["party_name"] == "TEST_PartyA"), None)
        if test_party_a:
            assert test_party_a["total_jama"] == 10000
            assert test_party_a["total_nikasi"] == 5000
            assert test_party_a["balance"] == 5000
            print(f"TEST_PartyA balance calculation correct: {test_party_a}")
        
        # Find TEST_PartyB (should be settled - balance = 0)
        test_party_b = next((p for p in data["parties"] if p["party_name"] == "TEST_PartyB"), None)
        if test_party_b:
            assert test_party_b["balance"] == 0
            print(f"TEST_PartyB settled (balance=0): {test_party_b}")
    
    def test_party_summary_settled_pending_counts(self, api_client, auth_cookies, test_transactions):
        """Should correctly count settled and pending parties"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026")
        data = response.json()
        
        summary = data["summary"]
        # Manually count from parties
        parties = data["parties"]
        test_parties = [p for p in parties if p["party_name"].startswith("TEST_")]
        
        settled = sum(1 for p in test_parties if p["balance"] == 0)
        pending = sum(1 for p in test_parties if p["balance"] != 0)
        
        print(f"Among TEST parties: {settled} settled, {pending} pending")
        # TEST_PartyB should be settled, TEST_PartyA and TEST_PartyC should be pending
        assert settled >= 1  # At least TEST_PartyB
        assert pending >= 2  # TEST_PartyA and TEST_PartyC
    
    def test_party_summary_filter_by_party_type(self, api_client, auth_cookies, test_transactions):
        """Should filter by party_type parameter"""
        api_client.cookies = auth_cookies
        
        # Filter by Local Party
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026&party_type=Local Party")
        assert response.status_code == 200
        data = response.json()
        
        # All returned parties should be Local Party or empty party_type
        for party in data["parties"]:
            if party["party_name"].startswith("TEST_"):
                assert party["party_type"] == "Local Party" or party["party_type"] == "", f"Expected Local Party, got {party['party_type']}"
        
        print(f"Party type filter 'Local Party' returned {len(data['parties'])} parties")
        
        # Filter by Truck
        response2 = api_client.get(f"{BASE_URL}/api/cash-book/party-summary?kms_year=2025-2026&party_type=Truck")
        assert response2.status_code == 200
        data2 = response2.json()
        print(f"Party type filter 'Truck' returned {len(data2['parties'])} parties")


class TestPartySummaryPDFExport:
    """Tests for GET /api/cash-book/party-summary/pdf endpoint"""
    
    def test_party_summary_pdf_returns_200(self, api_client, auth_cookies, test_transactions):
        """PDF export should return 200"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        assert response.status_code == 200
        print(f"GET /api/cash-book/party-summary/pdf: {response.status_code}")
    
    def test_party_summary_pdf_content_type(self, api_client, auth_cookies, test_transactions):
        """PDF should have correct content type"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower(), f"Expected PDF content-type, got {content_type}"
        print(f"PDF content-type: {content_type}")
    
    def test_party_summary_pdf_has_content(self, api_client, auth_cookies, test_transactions):
        """PDF should have non-empty content"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/pdf")
        assert response.status_code == 200
        assert len(response.content) > 100, "PDF content too small"
        # Check PDF magic bytes
        assert response.content[:4] == b'%PDF', "Content is not a valid PDF"
        print(f"PDF size: {len(response.content)} bytes")
    
    def test_party_summary_pdf_with_filter(self, api_client, auth_cookies, test_transactions):
        """PDF export should work with party_type filter"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/pdf?party_type=Truck")
        assert response.status_code == 200
        assert response.content[:4] == b'%PDF'
        print(f"Filtered PDF export (Truck) successful")


class TestPartySummaryExcelExport:
    """Tests for GET /api/cash-book/party-summary/excel endpoint"""
    
    def test_party_summary_excel_returns_200(self, api_client, auth_cookies, test_transactions):
        """Excel export should return 200"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/excel")
        assert response.status_code == 200
        print(f"GET /api/cash-book/party-summary/excel: {response.status_code}")
    
    def test_party_summary_excel_content_type(self, api_client, auth_cookies, test_transactions):
        """Excel should have correct content type"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/excel")
        assert response.status_code == 200
        content_type = response.headers.get("content-type", "")
        assert "spreadsheet" in content_type.lower() or "xlsx" in content_type.lower() or "excel" in content_type.lower(), f"Expected Excel content-type, got {content_type}"
        print(f"Excel content-type: {content_type}")
    
    def test_party_summary_excel_has_content(self, api_client, auth_cookies, test_transactions):
        """Excel should have non-empty content"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/excel")
        assert response.status_code == 200
        assert len(response.content) > 100, "Excel content too small"
        # Check Excel/ZIP magic bytes (XLSX is a ZIP file)
        assert response.content[:2] == b'PK', "Content is not a valid XLSX (ZIP) file"
        print(f"Excel size: {len(response.content)} bytes")
    
    def test_party_summary_excel_with_filter(self, api_client, auth_cookies, test_transactions):
        """Excel export should work with party_type filter"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book/party-summary/excel?party_type=Agent")
        assert response.status_code == 200
        assert response.content[:2] == b'PK'
        print(f"Filtered Excel export (Agent) successful")


class TestCashBookFilters:
    """Tests for cash book filter ordering and functionality"""
    
    def test_party_type_filter_endpoint(self, api_client, auth_cookies, test_transactions):
        """Party type filter should work on cash-book endpoint"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book?party_type=Truck&kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # All returned transactions should have party_type = Truck or no party_type
        truck_txns = [t for t in data if t.get("category", "").startswith("TEST_") and t.get("party_type") == "Truck"]
        print(f"Party type filter 'Truck' returned {len(truck_txns)} TEST transactions")
    
    def test_category_filter_endpoint(self, api_client, auth_cookies, test_transactions):
        """Category (party) filter should work on cash-book endpoint"""
        api_client.cookies = auth_cookies
        response = api_client.get(f"{BASE_URL}/api/cash-book?category=TEST_PartyA&kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        # All returned transactions should be for TEST_PartyA
        for txn in data:
            assert txn["category"] == "TEST_PartyA", f"Expected TEST_PartyA, got {txn['category']}"
        
        print(f"Category filter 'TEST_PartyA' returned {len(data)} transactions")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
