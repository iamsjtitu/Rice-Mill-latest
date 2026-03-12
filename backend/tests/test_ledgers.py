"""
Test cases for Phase 5: Consolidated Ledgers - Outstanding Report & Party Ledger
Tests: 
- GET /api/reports/outstanding - outstanding report with dc, msp, trucks, agents, frk
- GET /api/reports/party-ledger - party ledger with filters
- GET /api/reports/outstanding/excel - Excel export
- GET /api/reports/outstanding/pdf - PDF export
- GET /api/reports/party-ledger/excel - Excel export  
- GET /api/reports/party-ledger/pdf - PDF export
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://desktop-sync-2.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


class TestAuth:
    """Test authentication"""
    
    def test_login_admin(self):
        """Test admin login with admin/admin123"""
        response = requests.post(f"{API}/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "admin"
        assert data["role"] == "admin"
        print("PASS: Admin login successful")
    
    def test_login_staff(self):
        """Test staff login with staff/staff123"""
        response = requests.post(f"{API}/auth/login", json={
            "username": "staff",
            "password": "staff123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert data["success"] == True
        assert data["username"] == "staff"
        assert data["role"] == "staff"
        print("PASS: Staff login successful")


class TestOutstandingReport:
    """Test Outstanding Report endpoints"""
    
    def test_outstanding_report_structure(self):
        """Test GET /api/reports/outstanding returns correct structure"""
        response = requests.get(f"{API}/reports/outstanding")
        assert response.status_code == 200, f"Outstanding report failed: {response.text}"
        data = response.json()
        
        # Verify main keys exist
        assert "dc_outstanding" in data, "Missing dc_outstanding key"
        assert "msp_outstanding" in data, "Missing msp_outstanding key"
        assert "trucks" in data, "Missing trucks key"
        assert "agents" in data, "Missing agents key"
        assert "frk_parties" in data, "Missing frk_parties key"
        print("PASS: Outstanding report structure verified")
    
    def test_outstanding_dc_section(self):
        """Test DC outstanding section has items, total_pending_qntl, count"""
        response = requests.get(f"{API}/reports/outstanding")
        data = response.json()
        dc = data["dc_outstanding"]
        
        assert "items" in dc, "Missing dc_outstanding.items"
        assert "total_pending_qntl" in dc, "Missing dc_outstanding.total_pending_qntl"
        assert "count" in dc, "Missing dc_outstanding.count"
        assert isinstance(dc["items"], list), "items should be a list"
        print(f"PASS: DC Outstanding - {dc['count']} pending DCs, {dc['total_pending_qntl']}Q pending")
    
    def test_outstanding_msp_section(self):
        """Test MSP outstanding section fields"""
        response = requests.get(f"{API}/reports/outstanding")
        data = response.json()
        msp = data["msp_outstanding"]
        
        assert "total_delivered_qntl" in msp, "Missing total_delivered_qntl"
        assert "total_paid_qty" in msp, "Missing total_paid_qty"
        assert "total_paid_amount" in msp, "Missing total_paid_amount"
        assert "pending_qty" in msp, "Missing pending_qty"
        print(f"PASS: MSP Outstanding - Delivered: {msp['total_delivered_qntl']}Q, Pending: {msp['pending_qty']}Q")
    
    def test_outstanding_trucks_array(self):
        """Test trucks array structure"""
        response = requests.get(f"{API}/reports/outstanding")
        data = response.json()
        
        assert isinstance(data["trucks"], list), "trucks should be a list"
        if len(data["trucks"]) > 0:
            truck = data["trucks"][0]
            assert "truck_no" in truck, "Missing truck_no"
            assert "total_trips" in truck, "Missing total_trips"
            assert "total_qty_qntl" in truck, "Missing total_qty_qntl"
            assert "total_cash_paid" in truck, "Missing total_cash_paid"
            assert "total_diesel_paid" in truck, "Missing total_diesel_paid"
        print(f"PASS: Trucks Summary - {len(data['trucks'])} trucks found")
    
    def test_outstanding_agents_array(self):
        """Test agents array structure"""
        response = requests.get(f"{API}/reports/outstanding")
        data = response.json()
        
        assert isinstance(data["agents"], list), "agents should be a list"
        if len(data["agents"]) > 0:
            agent = data["agents"][0]
            assert "agent_name" in agent, "Missing agent_name"
            assert "total_entries" in agent, "Missing total_entries"
            assert "total_qty_qntl" in agent, "Missing total_qty_qntl"
        print(f"PASS: Agents Summary - {len(data['agents'])} agents found")
    
    def test_outstanding_frk_parties(self):
        """Test FRK parties array"""
        response = requests.get(f"{API}/reports/outstanding")
        data = response.json()
        
        assert isinstance(data["frk_parties"], list), "frk_parties should be a list"
        if len(data["frk_parties"]) > 0:
            frk = data["frk_parties"][0]
            assert "party_name" in frk, "Missing party_name"
            assert "total_qty" in frk, "Missing total_qty"
            assert "total_amount" in frk, "Missing total_amount"
        print(f"PASS: FRK Parties - {len(data['frk_parties'])} parties found")
    
    def test_outstanding_with_kms_filter(self):
        """Test outstanding report with KMS year filter"""
        response = requests.get(f"{API}/reports/outstanding?kms_year=2024-2025")
        assert response.status_code == 200, f"Failed with KMS filter: {response.text}"
        data = response.json()
        assert "dc_outstanding" in data
        print("PASS: Outstanding report with KMS filter works")


class TestPartyLedger:
    """Test Party Ledger endpoints"""
    
    def test_party_ledger_structure(self):
        """Test GET /api/reports/party-ledger returns correct structure"""
        response = requests.get(f"{API}/reports/party-ledger")
        assert response.status_code == 200, f"Party ledger failed: {response.text}"
        data = response.json()
        
        assert "ledger" in data, "Missing ledger key"
        assert "party_list" in data, "Missing party_list key"
        assert "total_debit" in data, "Missing total_debit key"
        assert "total_credit" in data, "Missing total_credit key"
        print("PASS: Party Ledger structure verified")
    
    def test_party_ledger_returns_array(self):
        """Test ledger array structure"""
        response = requests.get(f"{API}/reports/party-ledger")
        data = response.json()
        
        assert isinstance(data["ledger"], list), "ledger should be a list"
        if len(data["ledger"]) > 0:
            entry = data["ledger"][0]
            assert "date" in entry, "Missing date"
            assert "party_name" in entry, "Missing party_name"
            assert "party_type" in entry, "Missing party_type"
            assert "description" in entry, "Missing description"
            assert "debit" in entry, "Missing debit"
            assert "credit" in entry, "Missing credit"
            assert "ref" in entry, "Missing ref"
        print(f"PASS: Party Ledger - {len(data['ledger'])} transactions found")
    
    def test_party_ledger_party_list(self):
        """Test party_list for filter dropdown"""
        response = requests.get(f"{API}/reports/party-ledger")
        data = response.json()
        
        assert isinstance(data["party_list"], list), "party_list should be a list"
        if len(data["party_list"]) > 0:
            party = data["party_list"][0]
            assert "name" in party, "Missing name in party_list"
            assert "type" in party, "Missing type in party_list"
        print(f"PASS: Party List - {len(data['party_list'])} unique parties")
    
    def test_party_ledger_totals(self):
        """Test total_debit and total_credit are numeric"""
        response = requests.get(f"{API}/reports/party-ledger")
        data = response.json()
        
        assert isinstance(data["total_debit"], (int, float)), "total_debit should be numeric"
        assert isinstance(data["total_credit"], (int, float)), "total_credit should be numeric"
        print(f"PASS: Party Ledger Totals - Debit: {data['total_debit']}, Credit: {data['total_credit']}")
    
    def test_party_ledger_filter_agent(self):
        """Test party ledger with party_type=agent filter"""
        response = requests.get(f"{API}/reports/party-ledger?party_type=agent")
        assert response.status_code == 200, f"Agent filter failed: {response.text}"
        data = response.json()
        
        # All entries should be of type Agent
        for entry in data["ledger"]:
            assert entry["party_type"] == "Agent", f"Expected Agent, got {entry['party_type']}"
        print(f"PASS: Party Ledger agent filter - {len(data['ledger'])} agent entries")
    
    def test_party_ledger_filter_truck(self):
        """Test party ledger with party_type=truck filter"""
        response = requests.get(f"{API}/reports/party-ledger?party_type=truck")
        assert response.status_code == 200, f"Truck filter failed: {response.text}"
        data = response.json()
        
        # All entries should be of type Truck
        for entry in data["ledger"]:
            assert entry["party_type"] == "Truck", f"Expected Truck, got {entry['party_type']}"
        print(f"PASS: Party Ledger truck filter - {len(data['ledger'])} truck entries")
    
    def test_party_ledger_filter_frk_party(self):
        """Test party ledger with party_type=frk_party filter"""
        response = requests.get(f"{API}/reports/party-ledger?party_type=frk_party")
        assert response.status_code == 200, f"FRK filter failed: {response.text}"
        data = response.json()
        
        # All entries should be of type FRK Seller
        for entry in data["ledger"]:
            assert entry["party_type"] == "FRK Seller", f"Expected FRK Seller, got {entry['party_type']}"
        print(f"PASS: Party Ledger FRK filter - {len(data['ledger'])} FRK entries")
    
    def test_party_ledger_filter_buyer(self):
        """Test party ledger with party_type=buyer filter"""
        response = requests.get(f"{API}/reports/party-ledger?party_type=buyer")
        assert response.status_code == 200, f"Buyer filter failed: {response.text}"
        data = response.json()
        
        # All entries should be of type Buyer
        for entry in data["ledger"]:
            assert entry["party_type"] == "Buyer", f"Expected Buyer, got {entry['party_type']}"
        print(f"PASS: Party Ledger buyer filter - {len(data['ledger'])} buyer entries")


class TestLedgerExports:
    """Test Excel/PDF export endpoints"""
    
    def test_outstanding_excel_export(self):
        """Test GET /api/reports/outstanding/excel returns xlsx"""
        response = requests.get(f"{API}/reports/outstanding/excel")
        assert response.status_code == 200, f"Excel export failed: {response.text}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("Content-Type", "")
        assert len(response.content) > 100, "Excel file seems too small"
        print(f"PASS: Outstanding Excel export - {len(response.content)} bytes")
    
    def test_outstanding_pdf_export(self):
        """Test GET /api/reports/outstanding/pdf returns pdf"""
        response = requests.get(f"{API}/reports/outstanding/pdf")
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert "application/pdf" in response.headers.get("Content-Type", "")
        assert len(response.content) > 100, "PDF file seems too small"
        print(f"PASS: Outstanding PDF export - {len(response.content)} bytes")
    
    def test_party_ledger_excel_export(self):
        """Test GET /api/reports/party-ledger/excel returns xlsx"""
        response = requests.get(f"{API}/reports/party-ledger/excel")
        assert response.status_code == 200, f"Excel export failed: {response.text}"
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("Content-Type", "")
        assert len(response.content) > 100, "Excel file seems too small"
        print(f"PASS: Party Ledger Excel export - {len(response.content)} bytes")
    
    def test_party_ledger_pdf_export(self):
        """Test GET /api/reports/party-ledger/pdf returns pdf"""
        response = requests.get(f"{API}/reports/party-ledger/pdf")
        assert response.status_code == 200, f"PDF export failed: {response.text}"
        assert "application/pdf" in response.headers.get("Content-Type", "")
        assert len(response.content) > 100, "PDF file seems too small"
        print(f"PASS: Party Ledger PDF export - {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
