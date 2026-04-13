"""
Test Dynamic By-Product Categories Feature - Iteration 192
Tests that custom categories (like 'rejection_rice') appear in:
- GET /api/byproduct-categories
- GET /api/byproduct-stock
- GET /api/milling-summary
- GET /api/milling-report/excel
- GET /api/milling-report/pdf
- GET /api/byproduct-sales/excel
- GET /api/byproduct-sales/pdf
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestByProductCategoriesAPI:
    """Test /api/byproduct-categories endpoint returns all categories including custom ones"""
    
    def test_byproduct_categories_returns_200(self):
        """GET /api/byproduct-categories should return 200"""
        response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/byproduct-categories returns 200")
    
    def test_byproduct_categories_returns_list(self):
        """Response should be a list of categories"""
        response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 5, f"Expected at least 5 default categories, got {len(data)}"
        print(f"PASS: Returns {len(data)} categories")
    
    def test_byproduct_categories_has_default_categories(self):
        """Should include default categories: bran, kunda, broken, kanki, husk"""
        response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        data = response.json()
        cat_ids = [c['id'] for c in data]
        default_cats = ['bran', 'kunda', 'broken', 'kanki', 'husk']
        for cat in default_cats:
            assert cat in cat_ids, f"Missing default category: {cat}"
        print(f"PASS: All default categories present: {default_cats}")
    
    def test_byproduct_categories_has_custom_rejection_rice(self):
        """Should include custom category 'rejection_rice'"""
        response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        data = response.json()
        cat_ids = [c['id'] for c in data]
        assert 'rejection_rice' in cat_ids, "Custom category 'rejection_rice' not found"
        # Verify structure
        rejection_cat = next((c for c in data if c['id'] == 'rejection_rice'), None)
        assert rejection_cat is not None
        assert 'name' in rejection_cat
        assert 'name_hi' in rejection_cat
        assert 'is_auto' in rejection_cat
        assert 'order' in rejection_cat
        print(f"PASS: Custom category 'rejection_rice' found with name: {rejection_cat['name']}")


class TestByProductStockAPI:
    """Test /api/byproduct-stock returns stock data for ALL dynamic categories"""
    
    def test_byproduct_stock_returns_200(self):
        """GET /api/byproduct-stock should return 200"""
        response = requests.get(f"{BASE_URL}/api/byproduct-stock")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/byproduct-stock returns 200")
    
    def test_byproduct_stock_has_all_categories(self):
        """Stock data should include all categories from byproduct-categories"""
        cats_response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        categories = cats_response.json()
        cat_ids = [c['id'] for c in categories]
        
        stock_response = requests.get(f"{BASE_URL}/api/byproduct-stock")
        stock_data = stock_response.json()
        
        for cat_id in cat_ids:
            assert cat_id in stock_data, f"Stock data missing category: {cat_id}"
            # Verify stock structure
            assert 'produced_qntl' in stock_data[cat_id]
            assert 'sold_qntl' in stock_data[cat_id]
            assert 'available_qntl' in stock_data[cat_id]
            assert 'total_revenue' in stock_data[cat_id]
        print(f"PASS: Stock data includes all {len(cat_ids)} categories: {cat_ids}")
    
    def test_byproduct_stock_has_rejection_rice(self):
        """Stock data should specifically include rejection_rice"""
        response = requests.get(f"{BASE_URL}/api/byproduct-stock")
        data = response.json()
        assert 'rejection_rice' in data, "Stock data missing 'rejection_rice'"
        print(f"PASS: rejection_rice stock: {data['rejection_rice']}")


class TestMillingSummaryAPI:
    """Test /api/milling-summary returns dynamic by-product totals"""
    
    def test_milling_summary_returns_200(self):
        """GET /api/milling-summary should return 200"""
        response = requests.get(f"{BASE_URL}/api/milling-summary")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/milling-summary returns 200")
    
    def test_milling_summary_has_dynamic_totals(self):
        """Summary should include total_<category>_qntl for all categories"""
        cats_response = requests.get(f"{BASE_URL}/api/byproduct-categories")
        categories = cats_response.json()
        
        summary_response = requests.get(f"{BASE_URL}/api/milling-summary")
        summary = summary_response.json()
        
        for cat in categories:
            key = f"total_{cat['id']}_qntl"
            assert key in summary, f"Summary missing dynamic total: {key}"
        print(f"PASS: Summary includes dynamic totals for all categories")
    
    def test_milling_summary_has_rejection_rice_total(self):
        """Summary should include total_rejection_rice_qntl"""
        response = requests.get(f"{BASE_URL}/api/milling-summary")
        data = response.json()
        assert 'total_rejection_rice_qntl' in data, "Summary missing 'total_rejection_rice_qntl'"
        print(f"PASS: total_rejection_rice_qntl = {data['total_rejection_rice_qntl']}")


class TestMillingReportExports:
    """Test milling report Excel/PDF exports with dynamic by-product columns"""
    
    def test_milling_report_excel_returns_200(self):
        """GET /api/milling-report/excel should return 200"""
        response = requests.get(f"{BASE_URL}/api/milling-report/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/milling-report/excel returns 200")
    
    def test_milling_report_excel_content_type(self):
        """Excel export should have correct content type"""
        response = requests.get(f"{BASE_URL}/api/milling-report/excel")
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheetml' in content_type or 'excel' in content_type.lower(), \
            f"Expected Excel content type, got: {content_type}"
        print(f"PASS: Excel content-type: {content_type}")
    
    def test_milling_report_excel_has_content(self):
        """Excel export should have content"""
        response = requests.get(f"{BASE_URL}/api/milling-report/excel")
        assert len(response.content) > 0, "Excel file is empty"
        print(f"PASS: Excel file size: {len(response.content)} bytes")
    
    def test_milling_report_pdf_returns_200(self):
        """GET /api/milling-report/pdf should return 200"""
        response = requests.get(f"{BASE_URL}/api/milling-report/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/milling-report/pdf returns 200")
    
    def test_milling_report_pdf_content_type(self):
        """PDF export should have correct content type"""
        response = requests.get(f"{BASE_URL}/api/milling-report/pdf")
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got: {content_type}"
        print(f"PASS: PDF content-type: {content_type}")
    
    def test_milling_report_pdf_has_content(self):
        """PDF export should have content"""
        response = requests.get(f"{BASE_URL}/api/milling-report/pdf")
        assert len(response.content) > 0, "PDF file is empty"
        print(f"PASS: PDF file size: {len(response.content)} bytes")


class TestByProductSalesExports:
    """Test by-product sales Excel/PDF exports"""
    
    def test_byproduct_sales_excel_returns_200(self):
        """GET /api/byproduct-sales/excel should return 200"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/excel")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/byproduct-sales/excel returns 200")
    
    def test_byproduct_sales_excel_content_type(self):
        """Excel export should have correct content type"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/excel")
        content_type = response.headers.get('content-type', '')
        assert 'spreadsheetml' in content_type or 'excel' in content_type.lower(), \
            f"Expected Excel content type, got: {content_type}"
        print(f"PASS: Excel content-type: {content_type}")
    
    def test_byproduct_sales_pdf_returns_200(self):
        """GET /api/byproduct-sales/pdf should return 200"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/pdf")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/byproduct-sales/pdf returns 200")
    
    def test_byproduct_sales_pdf_content_type(self):
        """PDF export should have correct content type"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales/pdf")
        content_type = response.headers.get('content-type', '')
        assert 'pdf' in content_type.lower(), f"Expected PDF content type, got: {content_type}"
        print(f"PASS: PDF content-type: {content_type}")


class TestByProductSalesAPI:
    """Test /api/byproduct-sales endpoint"""
    
    def test_byproduct_sales_returns_200(self):
        """GET /api/byproduct-sales should return 200"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("PASS: GET /api/byproduct-sales returns 200")
    
    def test_byproduct_sales_returns_list(self):
        """Response should be a list"""
        response = requests.get(f"{BASE_URL}/api/byproduct-sales")
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: Returns list with {len(data)} sales")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
