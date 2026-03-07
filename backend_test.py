import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any

class MillEntryAPITester:
    def __init__(self, base_url="https://mill-critical-patch.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.created_entries = []  # Track created entries for cleanup

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_api_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                     data: Dict = None, params: Dict = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}
            
            details = f"Status: {response.status_code}"
            if not success:
                details += f" (Expected: {expected_status})"
                if response.text:
                    details += f" Response: {response.text[:200]}"
            
            return self.log_test(name, success, details), response_data
            
        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_api_test("Root API", "GET", "", 200)

    def test_create_entry(self, entry_data: Dict) -> tuple[bool, str]:
        """Test creating a mill entry"""
        success, response = self.run_api_test(
            "Create Mill Entry", "POST", "entries", 200, entry_data
        )
        entry_id = response.get('id', '') if success else ''
        if entry_id:
            self.created_entries.append(entry_id)
        return success, entry_id

    def test_get_entries(self):
        """Test getting all entries"""
        return self.run_api_test("Get All Entries", "GET", "entries", 200)

    def test_get_entry_by_id(self, entry_id: str):
        """Test getting entry by ID"""
        return self.run_api_test(f"Get Entry by ID", "GET", f"entries/{entry_id}", 200)

    def test_update_entry(self, entry_id: str, update_data: Dict):
        """Test updating an entry"""
        return self.run_api_test(f"Update Entry", "PUT", f"entries/{entry_id}", 200, update_data)

    def test_delete_entry(self, entry_id: str):
        """Test deleting an entry"""
        return self.run_api_test(f"Delete Entry", "DELETE", f"entries/{entry_id}", 200)

    def test_auto_calculations(self):
        """Test auto-calculation logic"""
        print("\n🧮 Testing Auto-Calculation Logic...")
        
        # Test data with known values for calculation verification
        test_entry = {
            "date": "2024-01-15",
            "truck_no": "TEST001",
            "agent_name": "Test Agent",
            "mandi_name": "Test Mandi",
            "kg": 1000,  # Should give QNTL = 10.00
            "bag": 50,
            "g_deposite": 50,
            "gbw_cut": 100,  # Mill W = 1000 - 100 = 900
            "plastic_bag": 10,  # P.Pkt Cut = 10 * 0.5 = 5.0
            "cutting_percent": 5.0,  # Cutting = (1000-100-5) * 5/100 = 44.75
            "disc_dust_poll": 20,  # Final W = 1000-100-5-44.75-20 = 830.25
            "cash_paid": 5000,
            "fc": 5000
        }
        
        success, entry_id = self.test_create_entry(test_entry)
        if not success:
            return False
        
        # Get the created entry to verify calculations
        success, response = self.test_get_entry_by_id(entry_id)
        if not success:
            return False
        
        entry = response
        calculations_correct = True
        
        # Verify QNTL calculation (KG ÷ 100)
        expected_qntl = 10.0
        actual_qntl = entry.get('qntl', 0)
        if abs(actual_qntl - expected_qntl) > 0.01:
            print(f"❌ QNTL calculation wrong: Expected {expected_qntl}, Got {actual_qntl}")
            calculations_correct = False
        else:
            print(f"✅ QNTL calculation correct: {actual_qntl}")
        
        # Verify Mill W calculation (KG - GBW Cut)
        expected_mill_w = 900.0
        actual_mill_w = entry.get('mill_w', 0)
        if abs(actual_mill_w - expected_mill_w) > 0.01:
            print(f"❌ Mill W calculation wrong: Expected {expected_mill_w}, Got {actual_mill_w}")
            calculations_correct = False
        else:
            print(f"✅ Mill W calculation correct: {actual_mill_w}")
        
        # Verify P.Pkt Cut calculation (plastic_bag * 0.5)
        expected_p_pkt_cut = 5.0
        actual_p_pkt_cut = entry.get('p_pkt_cut', 0)
        if abs(actual_p_pkt_cut - expected_p_pkt_cut) > 0.01:
            print(f"❌ P.Pkt Cut calculation wrong: Expected {expected_p_pkt_cut}, Got {actual_p_pkt_cut}")
            calculations_correct = False
        else:
            print(f"✅ P.Pkt Cut calculation correct: {actual_p_pkt_cut}")
        
        # Verify Cutting calculation ((KG-GBW-P.Pkt) * cutting_percent / 100)
        expected_cutting = 44.75
        actual_cutting = entry.get('cutting', 0)
        if abs(actual_cutting - expected_cutting) > 0.01:
            print(f"❌ Cutting calculation wrong: Expected {expected_cutting}, Got {actual_cutting}")
            calculations_correct = False
        else:
            print(f"✅ Cutting calculation correct: {actual_cutting}")
        
        # Verify Final W calculation (KG - GBW - P.Pkt Cut - Cutting - Disc)
        expected_final_w = 830.25
        actual_final_w = entry.get('final_w', 0)
        if abs(actual_final_w - expected_final_w) > 0.01:
            print(f"❌ Final W calculation wrong: Expected {expected_final_w}, Got {actual_final_w}")
            calculations_correct = False
        else:
            print(f"✅ Final W calculation correct: {actual_final_w}")
        
        return self.log_test("Auto-Calculations Verification", calculations_correct)

    def test_suggestions_endpoints(self):
        """Test auto-suggest endpoints"""
        print("\n🔍 Testing Auto-Suggest Endpoints...")
        
        # Test truck suggestions
        success1, _ = self.run_api_test("Truck Suggestions", "GET", "suggestions/trucks", 200)
        success2, _ = self.run_api_test("Truck Suggestions with Query", "GET", "suggestions/trucks", 200, params={"q": "TEST"})
        
        # Test agent suggestions  
        success3, _ = self.run_api_test("Agent Suggestions", "GET", "suggestions/agents", 200)
        success4, _ = self.run_api_test("Agent Suggestions with Query", "GET", "suggestions/agents", 200, params={"q": "Test"})
        
        # Test mandi suggestions
        success5, _ = self.run_api_test("Mandi Suggestions", "GET", "suggestions/mandis", 200)
        success6, _ = self.run_api_test("Mandi Suggestions with Query", "GET", "suggestions/mandis", 200, params={"q": "Test"})
        success7, _ = self.run_api_test("Mandi Suggestions by Agent", "GET", "suggestions/mandis", 200, params={"agent_name": "Test Agent"})
        
        return all([success1, success2, success3, success4, success5, success6, success7])

    def test_filtering_and_totals(self):
        """Test filtering and totals functionality"""
        print("\n📊 Testing Filtering and Totals...")
        
        # Test totals endpoint
        success1, _ = self.run_api_test("Get Totals", "GET", "totals", 200)
        
        # Test filtered totals
        success2, _ = self.run_api_test("Filtered Totals by Truck", "GET", "totals", 200, params={"truck_no": "TEST"})
        success3, _ = self.run_api_test("Filtered Totals by Agent", "GET", "totals", 200, params={"agent_name": "Test"})
        success4, _ = self.run_api_test("Filtered Totals by Mandi", "GET", "totals", 200, params={"mandi_name": "Test"})
        
        # Test filtered entries
        success5, _ = self.run_api_test("Filtered Entries by Truck", "GET", "entries", 200, params={"truck_no": "TEST"})
        success6, _ = self.run_api_test("Filtered Entries by Agent", "GET", "entries", 200, params={"agent_name": "Test"})
        success7, _ = self.run_api_test("Filtered Entries by Mandi", "GET", "entries", 200, params={"mandi_name": "Test"})
        
        return all([success1, success2, success3, success4, success5, success6, success7])

    def test_export_functionality(self):
        """Test export endpoints"""
        print("\n📄 Testing Export Functionality...")
        
        # Test Excel export
        success1, _ = self.run_api_test("Export Excel", "GET", "export/excel", 200)
        success2, _ = self.run_api_test("Export Excel with Filters", "GET", "export/excel", 200, 
                                      params={"truck_no": "TEST", "agent_name": "Test"})
        
        return all([success1, success2])

    def test_agent_mandi_management(self):
        """Test agent-mandi category management"""
        print("\n👥 Testing Agent-Mandi Management...")
        
        # Create agent-mandi relationship
        agent_mandi_data = {
            "agent_name": "Test Agent Category",
            "mandi_names": ["Mandi A", "Mandi B", "Mandi C"]
        }
        
        success1, response1 = self.run_api_test("Create Agent-Mandi", "POST", "agent-mandi", 200, agent_mandi_data)
        
        # Get all agent-mandis
        success2, _ = self.run_api_test("Get Agent-Mandis", "GET", "agent-mandi", 200)
        
        # Get mandis for specific agent
        success3, _ = self.run_api_test("Get Mandis for Agent", "GET", "agent-mandi/Test Agent Category/mandis", 200)
        
        return all([success1, success2, success3])

    def cleanup_test_data(self):
        """Clean up created test entries"""
        print(f"\n🧹 Cleaning up {len(self.created_entries)} test entries...")
        for entry_id in self.created_entries:
            try:
                self.test_delete_entry(entry_id)
            except:
                pass

    def run_comprehensive_test(self):
        """Run all tests"""
        print("🚀 Starting Comprehensive Mill Entry API Testing...")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Test basic connectivity
        self.test_root_endpoint()
        
        # Test CRUD operations with auto-calculations
        self.test_auto_calculations()
        
        # Test auto-suggest functionality
        self.test_suggestions_endpoints()
        
        # Test filtering and totals
        self.test_filtering_and_totals()
        
        # Test export functionality
        self.test_export_functionality()
        
        # Test agent-mandi management
        self.test_agent_mandi_management()
        
        # Clean up test data
        self.cleanup_test_data()
        
        # Print final results
        print("\n" + "=" * 60)
        print(f"📊 FINAL RESULTS: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if success_rate >= 90:
            print("🎉 Backend APIs are working excellently!")
            return 0
        elif success_rate >= 70:
            print("⚠️  Backend APIs are mostly working with some issues")
            return 1
        else:
            print("❌ Backend APIs have significant issues")
            return 2

def main():
    tester = MillEntryAPITester()
    return tester.run_comprehensive_test()

if __name__ == "__main__":
    sys.exit(main())