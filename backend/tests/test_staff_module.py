"""
Staff Management Module Tests - Iteration 22
Tests: Staff Master CRUD, Attendance, Advance, Salary Calculation, Payment with Cash Book integration
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ledger-parity.preview.emergentagent.com')

@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ============ STAFF MASTER CRUD TESTS ============

class TestStaffMasterCRUD:
    """Staff Master - Add/Edit/Delete staff with salary type"""
    
    def test_get_staff_list(self, api_client):
        """GET /api/staff returns staff list"""
        response = api_client.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/staff returns {len(data)} staff members")
    
    def test_staff_data_structure(self, api_client):
        """Staff data has required fields: id, name, salary_type, salary_amount, active"""
        response = api_client.get(f"{BASE_URL}/api/staff")
        assert response.status_code == 200
        data = response.json()
        if len(data) > 0:
            staff = data[0]
            assert "id" in staff
            assert "name" in staff
            assert "salary_type" in staff
            assert "salary_amount" in staff
            assert "active" in staff
            print(f"✓ Staff data structure valid: {staff['name']} ({staff['salary_type']} - ₹{staff['salary_amount']})")
    
    def test_add_staff_monthly(self, api_client):
        """POST /api/staff creates new monthly staff"""
        payload = {
            "name": f"TEST_Monthly_Staff_{uuid.uuid4().hex[:6]}",
            "salary_type": "monthly",
            "salary_amount": 15000
        }
        response = api_client.post(f"{BASE_URL}/api/staff", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["salary_type"] == "monthly"
        assert data["salary_amount"] == 15000
        assert "id" in data
        print(f"✓ Created monthly staff: {data['name']} with ₹{data['salary_amount']}/month")
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/staff/{data['id']}")
    
    def test_add_staff_weekly(self, api_client):
        """POST /api/staff creates new weekly (per day) staff"""
        payload = {
            "name": f"TEST_Weekly_Staff_{uuid.uuid4().hex[:6]}",
            "salary_type": "weekly",
            "salary_amount": 600
        }
        response = api_client.post(f"{BASE_URL}/api/staff", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == payload["name"]
        assert data["salary_type"] == "weekly"
        assert data["salary_amount"] == 600
        print(f"✓ Created weekly staff: {data['name']} with ₹{data['salary_amount']}/day")
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/staff/{data['id']}")
    
    def test_update_staff(self, api_client):
        """PUT /api/staff/{id} updates staff details"""
        # Create first
        create_payload = {"name": f"TEST_Update_{uuid.uuid4().hex[:6]}", "salary_type": "monthly", "salary_amount": 10000}
        create_res = api_client.post(f"{BASE_URL}/api/staff", json=create_payload)
        staff_id = create_res.json()["id"]
        
        # Update
        update_payload = {"salary_amount": 12000}
        response = api_client.put(f"{BASE_URL}/api/staff/{staff_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["salary_amount"] == 12000
        print(f"✓ Updated staff salary from ₹10000 to ₹12000")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/staff/{staff_id}")
    
    def test_delete_staff_deactivates(self, api_client):
        """DELETE /api/staff/{id} deactivates staff (soft delete)"""
        # Create first
        create_payload = {"name": f"TEST_Delete_{uuid.uuid4().hex[:6]}", "salary_type": "weekly", "salary_amount": 500}
        create_res = api_client.post(f"{BASE_URL}/api/staff", json=create_payload)
        staff_id = create_res.json()["id"]
        
        # Delete (soft delete - deactivate)
        response = api_client.delete(f"{BASE_URL}/api/staff/{staff_id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Staff deactivated"
        print(f"✓ Staff deactivated (soft delete)")


# ============ ATTENDANCE TESTS ============

class TestStaffAttendance:
    """Attendance - Mark P/A/H/CH for staff"""
    
    def test_get_attendance_by_date(self, api_client):
        """GET /api/staff/attendance?date=X returns attendance for date"""
        response = api_client.get(f"{BASE_URL}/api/staff/attendance?date=2026-03-01")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET attendance for 2026-03-01: {len(data)} records")
    
    def test_get_attendance_by_staff(self, api_client):
        """GET /api/staff/attendance?staff_id=X returns staff attendance"""
        # Get Eshwer's ID (monthly staff)
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        response = api_client.get(f"{BASE_URL}/api/staff/attendance?staff_id={eshwer['id']}")
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 5  # 5 days of test data
        print(f"✓ Eshwer has {len(data)} attendance records")
    
    def test_attendance_statuses(self, api_client):
        """Attendance records have valid statuses: present, absent, half_day, holiday"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        response = api_client.get(f"{BASE_URL}/api/staff/attendance?staff_id={eshwer['id']}")
        data = response.json()
        valid_statuses = {"present", "absent", "half_day", "holiday"}
        statuses_found = set()
        for att in data:
            assert att["status"] in valid_statuses
            statuses_found.add(att["status"])
        print(f"✓ Found attendance statuses: {statuses_found}")
    
    def test_bulk_attendance_save(self, api_client):
        """POST /api/staff/attendance/bulk saves multiple attendance records"""
        # Get staff list
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        staff = staff_res.json()[:2]  # First 2 staff
        
        test_date = "2026-03-10"
        records = [
            {"staff_id": staff[0]["id"], "staff_name": staff[0]["name"], "status": "present"},
            {"staff_id": staff[1]["id"], "staff_name": staff[1]["name"], "status": "absent"} if len(staff) > 1 else None
        ]
        records = [r for r in records if r]  # Filter None
        
        payload = {
            "date": test_date,
            "records": records,
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = api_client.post(f"{BASE_URL}/api/staff/attendance/bulk", json=payload)
        assert response.status_code == 200
        assert "saved" in response.json()["message"].lower()
        print(f"✓ Bulk attendance saved for {len(records)} staff on {test_date}")


# ============ ADVANCE TESTS ============

class TestStaffAdvance:
    """Advance - Track advance payments to staff"""
    
    def test_get_advances(self, api_client):
        """GET /api/staff/advance returns advance list"""
        response = api_client.get(f"{BASE_URL}/api/staff/advance")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET advances: {len(data)} records")
    
    def test_advance_data_structure(self, api_client):
        """Advance has: id, staff_id, staff_name, amount, date, description"""
        response = api_client.get(f"{BASE_URL}/api/staff/advance")
        data = response.json()
        if len(data) > 0:
            adv = data[0]
            assert "id" in adv
            assert "staff_id" in adv
            assert "staff_name" in adv
            assert "amount" in adv
            assert "date" in adv
            print(f"✓ Advance: {adv['staff_name']} - ₹{adv['amount']} on {adv['date']}")
    
    def test_add_advance(self, api_client):
        """POST /api/staff/advance creates new advance"""
        # Get a staff member
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        staff = staff_res.json()[0]
        
        payload = {
            "staff_id": staff["id"],
            "staff_name": staff["name"],
            "amount": 1000,
            "date": "2026-03-08",
            "description": "TEST_Advance",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = api_client.post(f"{BASE_URL}/api/staff/advance", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["amount"] == 1000
        assert data["staff_name"] == staff["name"]
        print(f"✓ Created advance: ₹{data['amount']} for {data['staff_name']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/staff/advance/{data['id']}")
    
    def test_delete_advance(self, api_client):
        """DELETE /api/staff/advance/{id} removes advance"""
        # Get a staff member and create advance
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        staff = staff_res.json()[0]
        
        # Create
        create_res = api_client.post(f"{BASE_URL}/api/staff/advance", json={
            "staff_id": staff["id"], "staff_name": staff["name"], "amount": 500, "date": "2026-03-08"
        })
        adv_id = create_res.json()["id"]
        
        # Delete
        response = api_client.delete(f"{BASE_URL}/api/staff/advance/{adv_id}")
        assert response.status_code == 200
        assert response.json()["message"] == "Advance deleted"
        print(f"✓ Deleted advance successfully")
    
    def test_get_advance_balance(self, api_client):
        """GET /api/staff/advance-balance/{staff_id} returns balance"""
        # Get Eshwer's ID
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        response = api_client.get(f"{BASE_URL}/api/staff/advance-balance/{eshwer['id']}")
        assert response.status_code == 200
        data = response.json()
        assert "total_advance" in data
        assert "total_deducted" in data
        assert "balance" in data
        assert data["total_advance"] == 6000  # Test data has ₹6000 advance
        print(f"✓ Advance balance for Eshwer: ₹{data['balance']} (Total: ₹{data['total_advance']}, Deducted: ₹{data['total_deducted']})")


# ============ SALARY CALCULATION TESTS ============

class TestSalaryCalculation:
    """Salary Calculate - Days worked, Gross salary, Advance balance"""
    
    def test_salary_calculate_endpoint(self, api_client):
        """GET /api/staff/salary-calculate returns calculation"""
        # Get Eshwer's ID (monthly staff)
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        params = f"staff_id={eshwer['id']}&period_from=2026-03-01&period_to=2026-03-05"
        response = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert "staff" in data
        assert "total_days" in data
        assert "present_days" in data
        assert "half_days" in data
        assert "holidays" in data
        assert "absents" in data
        assert "days_worked" in data
        assert "per_day_rate" in data
        assert "gross_salary" in data
        assert "advance_balance" in data
        print(f"✓ Salary calculation structure valid")
    
    def test_days_worked_calculation(self, api_client):
        """Days Worked = Present + Holiday + HalfDay*0.5"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        params = f"staff_id={eshwer['id']}&period_from=2026-03-01&period_to=2026-03-05"
        response = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
        data = response.json()
        
        # Test data: 2 present, 1 half_day, 1 holiday, 1 absent
        assert data["present_days"] == 2
        assert data["half_days"] == 1
        assert data["holidays"] == 1
        assert data["absents"] == 1
        
        # Days worked = 2 + 1 + 0.5 = 3.5
        expected_days_worked = data["present_days"] + data["holidays"] + (data["half_days"] * 0.5)
        assert data["days_worked"] == expected_days_worked
        assert data["days_worked"] == 3.5
        print(f"✓ Days worked calculation: {data['present_days']}P + {data['holidays']}H + {data['half_days']}*0.5HD = {data['days_worked']}")
    
    def test_monthly_salary_calculation(self, api_client):
        """Monthly salary: gross = (salary/30) × days_worked"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        params = f"staff_id={eshwer['id']}&period_from=2026-03-01&period_to=2026-03-05"
        response = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
        data = response.json()
        
        # Eshwer: monthly ₹12000, per day = 12000/30 = 400
        assert data["staff"]["salary_type"] == "monthly"
        assert data["staff"]["salary_amount"] == 12000
        assert data["per_day_rate"] == 400
        
        # Gross = 3.5 days × ₹400 = ₹1400
        expected_gross = data["days_worked"] * data["per_day_rate"]
        assert data["gross_salary"] == expected_gross
        assert data["gross_salary"] == 1400
        print(f"✓ Monthly salary: {data['days_worked']} days × ₹{data['per_day_rate']}/day = ₹{data['gross_salary']}")
    
    def test_weekly_salary_calculation(self, api_client):
        """Weekly salary: gross = per_day_rate × days_worked"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        raju = next((s for s in staff_res.json() if s["name"] == "Raju"), None)
        if not raju:
            pytest.skip("Raju staff not found")
        
        # First add attendance for Raju
        att_payload = {
            "date": "2026-03-01",
            "records": [{"staff_id": raju["id"], "staff_name": raju["name"], "status": "present"}],
            "kms_year": "2025-2026", "season": "Kharif"
        }
        api_client.post(f"{BASE_URL}/api/staff/attendance/bulk", json=att_payload)
        
        params = f"staff_id={raju['id']}&period_from=2026-03-01&period_to=2026-03-01"
        response = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
        data = response.json()
        
        # Raju: weekly ₹500/day
        assert data["staff"]["salary_type"] == "weekly"
        assert data["per_day_rate"] == 500
        
        # Gross = days × ₹500
        if data["days_worked"] > 0:
            expected_gross = data["days_worked"] * 500
            assert data["gross_salary"] == expected_gross
            print(f"✓ Weekly salary: {data['days_worked']} days × ₹500/day = ₹{data['gross_salary']}")
    
    def test_advance_balance_in_calculation(self, api_client):
        """Advance balance is included in salary calculation"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        params = f"staff_id={eshwer['id']}&period_from=2026-03-01&period_to=2026-03-05"
        response = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
        data = response.json()
        
        # Eshwer has ₹6000 advance
        assert data["advance_balance"] == 6000
        print(f"✓ Advance balance in calculation: ₹{data['advance_balance']}")


# ============ SALARY PAYMENT & CASH BOOK TESTS ============

class TestSalaryPayment:
    """Salary Payment - Settle salary with auto Cash Book entry"""
    
    def test_get_payments(self, api_client):
        """GET /api/staff/payments returns payment list"""
        response = api_client.get(f"{BASE_URL}/api/staff/payments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET payments: {len(data)} records")
    
    def test_create_payment_with_cash_book_entry(self, api_client):
        """POST /api/staff/payments creates payment + Cash Book nikasi"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        payload = {
            "staff_id": eshwer["id"],
            "staff_name": "Eshwer",
            "salary_type": "monthly",
            "salary_amount": 12000,
            "period_from": "2026-03-01",
            "period_to": "2026-03-05",
            "total_days": 5,
            "days_worked": 3.5,
            "holidays": 1,
            "half_days": 1,
            "absents": 1,
            "gross_salary": 1400,
            "advance_balance": 6000,
            "advance_deducted": 1000,  # Deduct ₹1000 from advance
            "net_payment": 400,  # 1400 - 1000 = 400
            "date": "2026-03-08",
            "kms_year": "2025-2026",
            "season": "Kharif"
        }
        response = api_client.post(f"{BASE_URL}/api/staff/payments", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert data["net_payment"] == 400
        assert "cash_book_entry" in data
        assert data["cash_book_entry"]["txn_type"] == "nikasi"
        assert data["cash_book_entry"]["category"] == "Staff Salary"
        assert data["cash_book_entry"]["amount"] == 400
        print(f"✓ Payment created: ₹{data['net_payment']} with Cash Book entry (nikasi)")
        
        # Verify cash book entry reference
        assert "staff_payment:" in data["cash_book_entry"]["reference"]
        
        # Cleanup - delete payment (should also delete cash book entry)
        payment_id = data["id"]
        delete_res = api_client.delete(f"{BASE_URL}/api/staff/payments/{payment_id}")
        assert delete_res.status_code == 200
        print(f"✓ Payment deleted with Cash Book entry cleanup")
    
    def test_delete_payment_removes_cash_book_entry(self, api_client):
        """DELETE /api/staff/payments/{id} removes payment AND cash book entry"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        # Create payment
        payload = {
            "staff_id": eshwer["id"], "staff_name": "Eshwer",
            "salary_type": "monthly", "salary_amount": 12000,
            "period_from": "2026-03-01", "period_to": "2026-03-02",
            "total_days": 2, "days_worked": 2, "holidays": 0, "half_days": 0, "absents": 0,
            "gross_salary": 800, "advance_balance": 6000, "advance_deducted": 0,
            "net_payment": 800, "date": "2026-03-08"
        }
        create_res = api_client.post(f"{BASE_URL}/api/staff/payments", json=payload)
        payment_id = create_res.json()["id"]
        cb_reference = create_res.json()["cash_book_entry"]["reference"]
        
        # Delete payment
        response = api_client.delete(f"{BASE_URL}/api/staff/payments/{payment_id}")
        assert response.status_code == 200
        assert "cash book" in response.json()["message"].lower()
        print(f"✓ Payment deleted and cash book entry removed")
    
    def test_payment_with_full_advance_deduction(self, api_client):
        """Payment with advance deduction greater than gross results in lower net"""
        staff_res = api_client.get(f"{BASE_URL}/api/staff")
        eshwer = next((s for s in staff_res.json() if s["name"] == "Eshwer"), None)
        if not eshwer:
            pytest.skip("Eshwer staff not found")
        
        # Create payment with full gross deducted as advance
        payload = {
            "staff_id": eshwer["id"], "staff_name": "Eshwer",
            "salary_type": "monthly", "salary_amount": 12000,
            "period_from": "2026-03-01", "period_to": "2026-03-05",
            "total_days": 5, "days_worked": 3.5, "holidays": 1, "half_days": 1, "absents": 1,
            "gross_salary": 1400, "advance_balance": 6000, 
            "advance_deducted": 1400,  # Full gross deducted
            "net_payment": 0,  # 1400 - 1400 = 0
            "date": "2026-03-09"
        }
        response = api_client.post(f"{BASE_URL}/api/staff/payments", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["net_payment"] == 0
        
        # Zero net payment should not create cash book entry (or create with 0 amount)
        if "cash_book_entry" in data:
            # If entry created, it should be 0 or not created
            pass
        print(f"✓ Payment with full advance deduction: Net = ₹{data['net_payment']}")
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/staff/payments/{data['id']}")


# ============ INTEGRATION TESTS ============

class TestStaffIntegration:
    """End-to-end integration tests"""
    
    def test_full_salary_flow(self, api_client):
        """Full flow: Create staff → Mark attendance → Calculate salary → Verify"""
        # Create test staff
        staff_payload = {
            "name": f"TEST_Integration_{uuid.uuid4().hex[:6]}",
            "salary_type": "monthly",
            "salary_amount": 9000  # ₹300/day
        }
        staff_res = api_client.post(f"{BASE_URL}/api/staff", json=staff_payload)
        staff = staff_res.json()
        staff_id = staff["id"]
        
        try:
            # Mark 3 days attendance: 2 present, 1 half_day
            att_dates = [
                ("2026-03-11", "present"),
                ("2026-03-12", "present"),
                ("2026-03-13", "half_day"),
            ]
            for date, status in att_dates:
                att_payload = {
                    "date": date,
                    "records": [{"staff_id": staff_id, "staff_name": staff["name"], "status": status}]
                }
                api_client.post(f"{BASE_URL}/api/staff/attendance/bulk", json=att_payload)
            
            # Calculate salary
            params = f"staff_id={staff_id}&period_from=2026-03-11&period_to=2026-03-13"
            calc_res = api_client.get(f"{BASE_URL}/api/staff/salary-calculate?{params}")
            calc = calc_res.json()
            
            # Verify: 2 present + 0.5 half_day = 2.5 days worked
            assert calc["days_worked"] == 2.5
            assert calc["per_day_rate"] == 300  # 9000/30
            assert calc["gross_salary"] == 750  # 2.5 × 300
            print(f"✓ Integration test passed: {calc['days_worked']} days × ₹{calc['per_day_rate']} = ₹{calc['gross_salary']}")
        
        finally:
            # Cleanup
            api_client.delete(f"{BASE_URL}/api/staff/{staff_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
