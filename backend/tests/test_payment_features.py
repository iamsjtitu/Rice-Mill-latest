"""
Test Payment Tracking Features
Tests for:
- Truck Payments: rate, gross, deductions, net, paid, balance
- Agent/Mandi Payments: target-based calculations with base_rate and cutting_rate
- Admin can set truck rate per trip
- Admin can make partial payment to truck
- Admin can mark truck as fully paid
- Agent payment = (target_qntl × base_rate) + (cutting_qntl × cutting_rate)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USER = {"username": "admin", "password": "admin123"}
STAFF_USER = {"username": "staff", "password": "staff123"}


class TestTruckPaymentsEndpoint:
    """Test Truck Payments endpoint - shows all trips with rate, gross, deductions, net, paid, balance"""
    
    def test_get_truck_payments(self):
        """Test getting all truck payments"""
        response = requests.get(f"{BASE_URL}/api/truck-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} truck payments")
        
        # Verify structure if data exists
        if len(data) > 0:
            payment = data[0]
            required_fields = [
                "entry_id", "truck_no", "date", "total_qntl", "total_bag",
                "final_qntl", "cash_taken", "diesel_taken", "rate_per_qntl",
                "gross_amount", "deductions", "net_amount", "paid_amount",
                "balance_amount", "status", "kms_year", "season", "agent_name", "mandi_name"
            ]
            for field in required_fields:
                assert field in payment, f"Missing field: {field}"
            print(f"✓ Truck payment structure verified: {payment['truck_no']}")
    
    def test_truck_payments_with_kms_year_filter(self):
        """Test truck payments with KMS year filter"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} truck payments for KMS 2025-2026")
    
    def test_truck_payments_with_season_filter(self):
        """Test truck payments with season filter"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} truck payments for Kharif season")
    
    def test_truck_payment_calculation(self):
        """Test truck payment calculation: gross = final_qntl × rate, net = gross - deductions"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            payment = data[0]
            # Verify gross calculation
            expected_gross = round(payment["final_qntl"] * payment["rate_per_qntl"], 2)
            assert abs(payment["gross_amount"] - expected_gross) < 0.01, f"Gross mismatch: {payment['gross_amount']} vs {expected_gross}"
            
            # Verify deductions calculation
            expected_deductions = payment["cash_taken"] + payment["diesel_taken"]
            assert abs(payment["deductions"] - expected_deductions) < 0.01, f"Deductions mismatch"
            
            # Verify net calculation
            expected_net = round(expected_gross - expected_deductions, 2)
            assert abs(payment["net_amount"] - expected_net) < 0.01, f"Net mismatch"
            
            # Verify balance calculation
            expected_balance = max(0, round(payment["net_amount"] - payment["paid_amount"], 2))
            assert abs(payment["balance_amount"] - expected_balance) < 0.01, f"Balance mismatch"
            
            print(f"✓ Truck payment calculation verified:")
            print(f"  Gross: {payment['final_qntl']} × ₹{payment['rate_per_qntl']} = ₹{payment['gross_amount']}")
            print(f"  Deductions: Cash ₹{payment['cash_taken']} + Diesel ₹{payment['diesel_taken']} = ₹{payment['deductions']}")
            print(f"  Net: ₹{payment['gross_amount']} - ₹{payment['deductions']} = ₹{payment['net_amount']}")
            print(f"  Balance: ₹{payment['net_amount']} - ₹{payment['paid_amount']} = ₹{payment['balance_amount']}")


class TestTruckRateSetting:
    """Test Admin can set truck rate per trip"""
    
    def test_set_truck_rate_admin(self):
        """Test admin can set rate for a truck entry"""
        # Get existing truck payment
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        assert response.status_code == 200
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            original_rate = payments[0]["rate_per_qntl"]
            
            # Set new rate
            new_rate = 35.0
            set_response = requests.put(
                f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=admin&role=admin",
                json={"rate_per_qntl": new_rate}
            )
            assert set_response.status_code == 200
            data = set_response.json()
            assert data["success"] == True
            print(f"✓ Admin set truck rate to ₹{new_rate}/QNTL")
            
            # Verify rate was updated
            verify_response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
            updated_payment = next((p for p in verify_response.json() if p["entry_id"] == entry_id), None)
            assert updated_payment is not None
            assert updated_payment["rate_per_qntl"] == new_rate
            print(f"✓ Rate verified: ₹{updated_payment['rate_per_qntl']}/QNTL")
            
            # Restore original rate
            requests.put(
                f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=admin&role=admin",
                json={"rate_per_qntl": original_rate}
            )
            print(f"✓ Rate restored to ₹{original_rate}/QNTL")
    
    def test_set_truck_rate_staff_forbidden(self):
        """Test staff cannot set truck rate"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            
            set_response = requests.put(
                f"{BASE_URL}/api/truck-payments/{entry_id}/rate?username=staff&role=staff",
                json={"rate_per_qntl": 40.0}
            )
            assert set_response.status_code == 403
            print("✓ Staff correctly forbidden from setting truck rate")


class TestTruckPaymentMaking:
    """Test Admin can make partial payment to truck"""
    
    def test_make_truck_payment_admin(self):
        """Test admin can make partial payment to truck"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            original_paid = payments[0]["paid_amount"]
            
            # Make payment
            payment_amount = 100.0
            pay_response = requests.post(
                f"{BASE_URL}/api/truck-payments/{entry_id}/pay?username=admin&role=admin",
                json={"amount": payment_amount, "note": "Test payment"}
            )
            assert pay_response.status_code == 200
            data = pay_response.json()
            assert data["success"] == True
            assert data["total_paid"] == original_paid + payment_amount
            print(f"✓ Admin made payment of ₹{payment_amount}")
            print(f"✓ Total paid now: ₹{data['total_paid']}")
            
            # Verify payment was recorded
            verify_response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
            updated_payment = next((p for p in verify_response.json() if p["entry_id"] == entry_id), None)
            assert updated_payment is not None
            assert updated_payment["paid_amount"] == original_paid + payment_amount
            print(f"✓ Payment verified in database")
    
    def test_make_truck_payment_staff_forbidden(self):
        """Test staff cannot make truck payment"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            
            pay_response = requests.post(
                f"{BASE_URL}/api/truck-payments/{entry_id}/pay?username=staff&role=staff",
                json={"amount": 100.0, "note": "Staff test"}
            )
            assert pay_response.status_code == 403
            print("✓ Staff correctly forbidden from making truck payment")


class TestTruckMarkPaid:
    """Test Admin can mark truck as fully paid"""
    
    def test_mark_truck_paid_admin(self):
        """Test admin can mark truck as fully paid"""
        # First create a test entry to mark as paid
        # Get existing entry
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            
            # Mark as paid
            mark_response = requests.post(
                f"{BASE_URL}/api/truck-payments/{entry_id}/mark-paid?username=admin&role=admin"
            )
            assert mark_response.status_code == 200
            data = mark_response.json()
            assert data["success"] == True
            print(f"✓ Admin marked truck as fully paid")
            
            # Verify status
            verify_response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
            updated_payment = next((p for p in verify_response.json() if p["entry_id"] == entry_id), None)
            assert updated_payment is not None
            assert updated_payment["status"] == "paid"
            assert updated_payment["balance_amount"] == 0
            print(f"✓ Status verified: {updated_payment['status']}, Balance: ₹{updated_payment['balance_amount']}")
    
    def test_mark_truck_paid_staff_forbidden(self):
        """Test staff cannot mark truck as paid"""
        response = requests.get(f"{BASE_URL}/api/truck-payments?kms_year=2025-2026")
        payments = response.json()
        
        if len(payments) > 0:
            entry_id = payments[0]["entry_id"]
            
            mark_response = requests.post(
                f"{BASE_URL}/api/truck-payments/{entry_id}/mark-paid?username=staff&role=staff"
            )
            assert mark_response.status_code == 403
            print("✓ Staff correctly forbidden from marking truck as paid")


class TestAgentPaymentsEndpoint:
    """Test Agent/Mandi Payments endpoint - target-based calculations"""
    
    def test_get_agent_payments(self):
        """Test getting all agent payments"""
        response = requests.get(f"{BASE_URL}/api/agent-payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} agent payments")
        
        # Verify structure if data exists
        if len(data) > 0:
            payment = data[0]
            required_fields = [
                "mandi_name", "agent_name", "target_qntl", "cutting_percent",
                "cutting_qntl", "base_rate", "cutting_rate", "target_amount",
                "cutting_amount", "total_amount", "achieved_qntl", "is_target_complete",
                "paid_amount", "balance_amount", "status", "kms_year", "season"
            ]
            for field in required_fields:
                assert field in payment, f"Missing field: {field}"
            print(f"✓ Agent payment structure verified: {payment['mandi_name']}")
    
    def test_agent_payments_with_filters(self):
        """Test agent payments with KMS year and season filters"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} agent payments with filters")
    
    def test_agent_payment_calculation(self):
        """Test agent payment calculation: (target_qntl × base_rate) + (cutting_qntl × cutting_rate)"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            payment = data[0]
            
            # Verify cutting_qntl calculation
            expected_cutting_qntl = round(payment["target_qntl"] * payment["cutting_percent"] / 100, 2)
            assert abs(payment["cutting_qntl"] - expected_cutting_qntl) < 0.01, f"Cutting QNTL mismatch"
            
            # Verify target_amount calculation
            expected_target_amount = round(payment["target_qntl"] * payment["base_rate"], 2)
            assert abs(payment["target_amount"] - expected_target_amount) < 0.01, f"Target amount mismatch"
            
            # Verify cutting_amount calculation
            expected_cutting_amount = round(payment["cutting_qntl"] * payment["cutting_rate"], 2)
            assert abs(payment["cutting_amount"] - expected_cutting_amount) < 0.01, f"Cutting amount mismatch"
            
            # Verify total_amount calculation
            expected_total = round(expected_target_amount + expected_cutting_amount, 2)
            assert abs(payment["total_amount"] - expected_total) < 0.01, f"Total amount mismatch"
            
            # Verify balance calculation
            expected_balance = max(0, round(payment["total_amount"] - payment["paid_amount"], 2))
            assert abs(payment["balance_amount"] - expected_balance) < 0.01, f"Balance mismatch"
            
            print(f"✓ Agent payment calculation verified for {payment['mandi_name']}:")
            print(f"  Target Amount: {payment['target_qntl']} × ₹{payment['base_rate']} = ₹{payment['target_amount']}")
            print(f"  Cutting QNTL: {payment['target_qntl']} × {payment['cutting_percent']}% = {payment['cutting_qntl']}")
            print(f"  Cutting Amount: {payment['cutting_qntl']} × ₹{payment['cutting_rate']} = ₹{payment['cutting_amount']}")
            print(f"  Total Amount: ₹{payment['target_amount']} + ₹{payment['cutting_amount']} = ₹{payment['total_amount']}")
            print(f"  Balance: ₹{payment['total_amount']} - ₹{payment['paid_amount']} = ₹{payment['balance_amount']}")


class TestAgentPaymentMaking:
    """Test Admin can make payment to agent/mandi"""
    
    def test_make_agent_payment_admin(self):
        """Test admin can make payment to agent/mandi"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        payments = response.json()
        
        if len(payments) > 0:
            mandi_name = payments[0]["mandi_name"]
            original_paid = payments[0]["paid_amount"]
            
            # Make payment
            payment_amount = 500.0
            pay_response = requests.post(
                f"{BASE_URL}/api/agent-payments/{mandi_name}/pay?kms_year=2025-2026&season=Kharif&username=admin&role=admin",
                json={"amount": payment_amount, "note": "Test agent payment"}
            )
            assert pay_response.status_code == 200
            data = pay_response.json()
            assert data["success"] == True
            assert data["total_paid"] == original_paid + payment_amount
            print(f"✓ Admin made agent payment of ₹{payment_amount} to {mandi_name}")
            print(f"✓ Total paid now: ₹{data['total_paid']}")
            
            # Verify payment was recorded
            verify_response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
            updated_payment = next((p for p in verify_response.json() if p["mandi_name"] == mandi_name), None)
            assert updated_payment is not None
            assert updated_payment["paid_amount"] == original_paid + payment_amount
            print(f"✓ Agent payment verified in database")
    
    def test_make_agent_payment_staff_forbidden(self):
        """Test staff cannot make agent payment"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        payments = response.json()
        
        if len(payments) > 0:
            mandi_name = payments[0]["mandi_name"]
            
            pay_response = requests.post(
                f"{BASE_URL}/api/agent-payments/{mandi_name}/pay?kms_year=2025-2026&season=Kharif&username=staff&role=staff",
                json={"amount": 100.0, "note": "Staff test"}
            )
            assert pay_response.status_code == 403
            print("✓ Staff correctly forbidden from making agent payment")


class TestAgentMarkPaid:
    """Test Admin can mark agent/mandi as fully paid"""
    
    def test_mark_agent_paid_admin(self):
        """Test admin can mark agent/mandi as fully paid"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        payments = response.json()
        
        if len(payments) > 0:
            mandi_name = payments[0]["mandi_name"]
            
            # Mark as paid
            mark_response = requests.post(
                f"{BASE_URL}/api/agent-payments/{mandi_name}/mark-paid?kms_year=2025-2026&season=Kharif&username=admin&role=admin"
            )
            assert mark_response.status_code == 200
            data = mark_response.json()
            assert data["success"] == True
            print(f"✓ Admin marked {mandi_name} as fully paid")
            
            # Verify status
            verify_response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
            updated_payment = next((p for p in verify_response.json() if p["mandi_name"] == mandi_name), None)
            assert updated_payment is not None
            assert updated_payment["status"] == "paid"
            assert updated_payment["balance_amount"] == 0
            print(f"✓ Status verified: {updated_payment['status']}, Balance: ₹{updated_payment['balance_amount']}")
    
    def test_mark_agent_paid_staff_forbidden(self):
        """Test staff cannot mark agent as paid"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        payments = response.json()
        
        if len(payments) > 0:
            mandi_name = payments[0]["mandi_name"]
            
            mark_response = requests.post(
                f"{BASE_URL}/api/agent-payments/{mandi_name}/mark-paid?kms_year=2025-2026&season=Kharif&username=staff&role=staff"
            )
            assert mark_response.status_code == 403
            print("✓ Staff correctly forbidden from marking agent as paid")


class TestTargetFormRates:
    """Test Target form has Base Rate and Cutting Rate fields"""
    
    def test_create_target_with_rates(self):
        """Test creating target with base_rate and cutting_rate"""
        unique_mandi = f"TEST_Rates_{uuid.uuid4().hex[:6]}"
        payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 2000.0,
            "cutting_percent": 5.0,
            "base_rate": 12.0,
            "cutting_rate": 6.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=payload
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["base_rate"] == 12.0
        assert data["cutting_rate"] == 6.0
        print(f"✓ Created target with base_rate=₹{data['base_rate']} and cutting_rate=₹{data['cutting_rate']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{data['id']}?username=admin&role=admin")
    
    def test_update_target_rates(self):
        """Test updating target rates"""
        unique_mandi = f"TEST_UpdateRates_{uuid.uuid4().hex[:6]}"
        create_payload = {
            "mandi_name": unique_mandi,
            "target_qntl": 1000.0,
            "cutting_percent": 5.0,
            "base_rate": 10.0,
            "cutting_rate": 5.0,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/mandi-targets?username=admin&role=admin",
            json=create_payload
        )
        assert create_response.status_code == 200
        target_id = create_response.json()["id"]
        
        # Update rates
        update_payload = {
            "base_rate": 15.0,
            "cutting_rate": 8.0
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin",
            json=update_payload
        )
        assert update_response.status_code == 200
        data = update_response.json()
        
        assert data["base_rate"] == 15.0
        assert data["cutting_rate"] == 8.0
        print(f"✓ Updated target rates: base_rate=₹{data['base_rate']}, cutting_rate=₹{data['cutting_rate']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/mandi-targets/{target_id}?username=admin&role=admin")


class TestDashboardAgentPaymentAmount:
    """Test Dashboard shows agent payment amount in target card"""
    
    def test_target_summary_includes_payment_amount(self):
        """Test target summary includes total_agent_amount"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets/summary?kms_year=2025-2026")
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            target = data[0]
            
            # Verify payment amount fields exist
            assert "base_rate" in target
            assert "cutting_rate" in target
            assert "target_amount" in target
            assert "cutting_qntl" in target
            assert "cutting_amount" in target
            assert "total_agent_amount" in target
            
            # Verify calculation
            expected_target_amount = target["target_qntl"] * target["base_rate"]
            expected_cutting_qntl = target["target_qntl"] * target["cutting_percent"] / 100
            expected_cutting_amount = expected_cutting_qntl * target["cutting_rate"]
            expected_total = expected_target_amount + expected_cutting_amount
            
            assert abs(target["total_agent_amount"] - expected_total) < 0.01
            
            print(f"✓ Dashboard target summary includes payment amount:")
            print(f"  Mandi: {target['mandi_name']}")
            print(f"  Target Amount: {target['target_qntl']} × ₹{target['base_rate']} = ₹{target['target_amount']}")
            print(f"  Cutting Amount: {target['cutting_qntl']} × ₹{target['cutting_rate']} = ₹{target['cutting_amount']}")
            print(f"  Total Agent Amount: ₹{target['total_agent_amount']}")


class TestBadkutruSpecificCalculation:
    """Test specific calculation for Badkutru: (5000×₹10) + (250×₹5) = ₹51,250"""
    
    def test_badkutru_agent_payment(self):
        """Test Badkutru agent payment calculation"""
        response = requests.get(f"{BASE_URL}/api/agent-payments?kms_year=2025-2026&season=Kharif")
        assert response.status_code == 200
        data = response.json()
        
        badkutru = next((p for p in data if p["mandi_name"] == "Badkutru"), None)
        if badkutru:
            # Verify expected values
            assert badkutru["target_qntl"] == 5000.0
            assert badkutru["cutting_percent"] == 5.0
            assert badkutru["cutting_qntl"] == 250.0  # 5000 × 5% = 250
            assert badkutru["base_rate"] == 10.0
            assert badkutru["cutting_rate"] == 5.0
            assert badkutru["target_amount"] == 50000.0  # 5000 × ₹10 = ₹50,000
            assert badkutru["cutting_amount"] == 1250.0  # 250 × ₹5 = ₹1,250
            assert badkutru["total_amount"] == 51250.0  # ₹50,000 + ₹1,250 = ₹51,250
            
            print(f"✓ Badkutru agent payment verified:")
            print(f"  Target: {badkutru['target_qntl']} QNTL × ₹{badkutru['base_rate']} = ₹{badkutru['target_amount']}")
            print(f"  Cutting: {badkutru['cutting_qntl']} QNTL × ₹{badkutru['cutting_rate']} = ₹{badkutru['cutting_amount']}")
            print(f"  Total: ₹{badkutru['total_amount']}")
        else:
            print("⚠ Badkutru target not found - skipping specific test")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_targets(self):
        """Remove all TEST_ prefixed targets"""
        response = requests.get(f"{BASE_URL}/api/mandi-targets")
        targets = response.json()
        
        deleted = 0
        for target in targets:
            if target["mandi_name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/mandi-targets/{target['id']}?username=admin&role=admin"
                )
                deleted += 1
        
        print(f"✓ Cleaned up {deleted} test targets")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
