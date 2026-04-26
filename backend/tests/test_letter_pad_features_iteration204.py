"""
Test Letter Pad Features - Iteration 204
Tests for: Templates Library, Drafts CRUD, WhatsApp Share, PDF/DOCX generation

Features tested:
1. Templates Library - 8 pre-seeded templates for rice millers
2. Drafts CRUD - Save/Load/Delete letter drafts
3. WhatsApp Share - Share letter PDF via 360Messenger
4. PDF/DOCX generation - Regression tests
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Expected template IDs
TEMPLATE_IDS = [
    "bank_statement",
    "supplier_reminder", 
    "agent_dispute",
    "govt_inquiry",
    "truck_owner_notice",
    "paddy_quality",
    "noc_request",
    "gst_compliance"
]


class TestTemplatesLibrary:
    """Tests for Letter Pad Templates Library (8 pre-seeded templates)"""
    
    def test_list_templates_returns_8_templates(self):
        """GET /api/letter-pad/templates returns 8 templates"""
        response = requests.get(f"{BASE_URL}/api/letter-pad/templates")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        templates = response.json()
        assert isinstance(templates, list), "Response should be a list"
        assert len(templates) == 8, f"Expected 8 templates, got {len(templates)}"
        
        # Verify each template has required fields
        for t in templates:
            assert "id" in t, f"Template missing 'id': {t}"
            assert "name" in t, f"Template missing 'name': {t}"
            assert "category" in t, f"Template missing 'category': {t}"
            assert "icon" in t, f"Template missing 'icon': {t}"
            assert "preview" in t, f"Template missing 'preview': {t}"
        
        # Verify all expected IDs are present
        template_ids = [t["id"] for t in templates]
        for expected_id in TEMPLATE_IDS:
            assert expected_id in template_ids, f"Missing template: {expected_id}"
    
    @pytest.mark.parametrize("template_id", TEMPLATE_IDS)
    def test_get_template_by_id(self, template_id):
        """GET /api/letter-pad/templates/{id} returns full template with body/subject/to_address/references"""
        response = requests.get(f"{BASE_URL}/api/letter-pad/templates/{template_id}")
        assert response.status_code == 200, f"Expected 200 for {template_id}, got {response.status_code}"
        
        template = response.json()
        assert template["id"] == template_id
        assert "name" in template
        assert "category" in template
        assert "body" in template, f"Template {template_id} missing 'body'"
        assert "subject" in template, f"Template {template_id} missing 'subject'"
        assert "to_address" in template, f"Template {template_id} missing 'to_address'"
        assert "references" in template, f"Template {template_id} missing 'references'"
        
        # Body should be non-empty
        assert len(template["body"]) > 50, f"Template {template_id} body too short"
    
    def test_get_invalid_template_returns_404(self):
        """GET /api/letter-pad/templates/invalid_id returns 404"""
        response = requests.get(f"{BASE_URL}/api/letter-pad/templates/invalid_template_xyz")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"


class TestDraftsCRUD:
    """Tests for Letter Pad Drafts CRUD operations"""
    
    @pytest.fixture
    def created_draft_id(self):
        """Create a draft and return its ID for testing, cleanup after"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "title": f"TEST_Draft_{unique_id}",
            "ref_no": "REF-001",
            "date": "15-01-2026",
            "to_address": "Test Address\nLine 2",
            "subject": f"Test Subject {unique_id}",
            "references": "Ref 1\nRef 2",
            "body": "This is a test letter body for testing purposes."
        }
        response = requests.post(f"{BASE_URL}/api/letter-pad/drafts", json=payload)
        assert response.status_code == 200, f"Failed to create draft: {response.text}"
        draft = response.json()
        yield draft["id"]
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/letter-pad/drafts/{draft['id']}")
    
    def test_create_draft_success(self):
        """POST /api/letter-pad/drafts creates a draft with auto-generated UUID"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "title": f"TEST_Create_Draft_{unique_id}",
            "ref_no": "REF-CREATE-001",
            "date": "15-01-2026",
            "to_address": "Bank Manager\nSBI Branch",
            "subject": f"Test Create Subject {unique_id}",
            "references": "Account No: 12345",
            "body": "Respected Sir, This is a test letter body."
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/drafts", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        draft = response.json()
        assert "id" in draft, "Draft should have 'id'"
        assert len(draft["id"]) > 10, "ID should be a UUID"
        assert draft["title"] == payload["title"]
        assert "created_at" in draft
        assert "updated_at" in draft
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/letter-pad/drafts/{draft['id']}")
    
    def test_create_draft_empty_body_and_subject_returns_400(self):
        """POST /api/letter-pad/drafts with empty body and subject returns 400"""
        payload = {
            "title": "",
            "ref_no": "",
            "date": "",
            "to_address": "",
            "subject": "",
            "references": "",
            "body": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/drafts", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "khaali" in data["detail"].lower() or "empty" in data["detail"].lower()
    
    def test_list_drafts_sorted_by_updated_at_desc(self, created_draft_id):
        """GET /api/letter-pad/drafts returns drafts sorted by updated_at desc"""
        response = requests.get(f"{BASE_URL}/api/letter-pad/drafts")
        assert response.status_code == 200
        
        drafts = response.json()
        assert isinstance(drafts, list)
        
        # If multiple drafts, verify sorting
        if len(drafts) >= 2:
            for i in range(len(drafts) - 1):
                assert drafts[i]["updated_at"] >= drafts[i+1]["updated_at"], \
                    "Drafts should be sorted by updated_at desc"
    
    def test_update_draft_preserves_title_when_not_in_payload(self, created_draft_id):
        """PUT /api/letter-pad/drafts/{id} preserves original title if not in payload"""
        # First get the original draft
        get_response = requests.get(f"{BASE_URL}/api/letter-pad/drafts")
        drafts = get_response.json()
        original_draft = next((d for d in drafts if d["id"] == created_draft_id), None)
        assert original_draft is not None, "Created draft not found"
        original_title = original_draft["title"]
        
        # Update only body, NOT title
        update_payload = {
            "body": "Updated body content - title should be preserved"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/letter-pad/drafts/{created_draft_id}",
            json=update_payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        updated_draft = response.json()
        assert updated_draft["title"] == original_title, \
            f"Title should be preserved. Expected '{original_title}', got '{updated_draft['title']}'"
        assert updated_draft["body"] == update_payload["body"]
    
    def test_update_draft_invalid_id_returns_404(self):
        """PUT /api/letter-pad/drafts/{invalid} returns 404"""
        response = requests.put(
            f"{BASE_URL}/api/letter-pad/drafts/invalid_draft_id_xyz",
            json={"body": "test"}
        )
        assert response.status_code == 404
    
    def test_delete_draft_success(self):
        """DELETE /api/letter-pad/drafts/{id} deletes the draft"""
        # Create a draft to delete
        unique_id = str(uuid.uuid4())[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/letter-pad/drafts",
            json={"subject": f"TEST_Delete_{unique_id}", "body": "To be deleted"}
        )
        draft_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/letter-pad/drafts/{draft_id}")
        assert delete_response.status_code == 200
        assert delete_response.json().get("success") == True
        
        # Verify it's gone
        list_response = requests.get(f"{BASE_URL}/api/letter-pad/drafts")
        draft_ids = [d["id"] for d in list_response.json()]
        assert draft_id not in draft_ids, "Deleted draft should not appear in list"
    
    def test_delete_draft_invalid_id_returns_404(self):
        """DELETE /api/letter-pad/drafts/{invalid} returns 404"""
        response = requests.delete(f"{BASE_URL}/api/letter-pad/drafts/invalid_draft_id_xyz")
        assert response.status_code == 404


class TestWhatsAppShare:
    """Tests for Letter Pad WhatsApp Share via 360Messenger"""
    
    def test_whatsapp_empty_body_returns_400(self):
        """POST /api/letter-pad/whatsapp with empty body returns 400"""
        payload = {
            "letter": {
                "ref_no": "REF-001",
                "date": "15-01-2026",
                "to_address": "Test",
                "subject": "Test Subject",
                "references": "",
                "body": ""  # Empty body
            },
            "mode": "phone",
            "phone": "9999999999"
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/whatsapp", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "body" in data["detail"].lower() or "khaali" in data["detail"].lower()
    
    def test_whatsapp_phone_mode_missing_phone_returns_400(self):
        """POST /api/letter-pad/whatsapp with mode=phone and missing phone returns 400"""
        payload = {
            "letter": {
                "ref_no": "REF-001",
                "date": "15-01-2026",
                "to_address": "Test",
                "subject": "Test Subject",
                "references": "",
                "body": "This is a test letter body."
            },
            "mode": "phone",
            "phone": ""  # Missing phone
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/whatsapp", json=payload)
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "phone" in data["detail"].lower()
    
    def test_whatsapp_with_valid_letter_and_phone(self):
        """POST /api/letter-pad/whatsapp with valid letter and phone - verify response shape
        
        Note: This may actually send a WhatsApp message if API key is configured.
        Using test number 9999999999 to avoid spamming real users.
        If API key not configured, expect 400 with 'API key set nahi hai'.
        """
        payload = {
            "letter": {
                "ref_no": "TEST-REF-001",
                "date": "15-01-2026",
                "to_address": "Test Recipient\nTest Address",
                "subject": "Test Letter from Automated Testing",
                "references": "Test Reference",
                "body": "Respected Sir,\n\nThis is an automated test letter from the testing system. Please ignore.\n\nThanking you."
            },
            "mode": "phone",
            "phone": "9999999999",  # Test number
            "caption": "Test message - please ignore"
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/whatsapp", json=payload)
        
        # Either 200 (success) or 400 (API key not configured)
        if response.status_code == 200:
            data = response.json()
            assert "success" in data, "Response should have 'success' key"
            assert "pdf_url" in data, "Response should have 'pdf_url' key"
            print(f"WhatsApp send successful: {data}")
        elif response.status_code == 400:
            data = response.json()
            # API key not configured is acceptable
            if "api key" in data.get("detail", "").lower():
                print(f"WhatsApp API key not configured (expected): {data['detail']}")
            else:
                pytest.fail(f"Unexpected 400 error: {data}")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}, body: {response.text}")


class TestPDFDocxGeneration:
    """Regression tests for PDF and DOCX generation"""
    
    def test_pdf_generation_success(self):
        """POST /api/letter-pad/pdf generates PDF with correct Content-Type and size > 5KB"""
        payload = {
            "ref_no": "TEST-PDF-001",
            "date": "15-01-2026",
            "to_address": "The Branch Manager\nState Bank of India\nKesinga Branch",
            "subject": "Request for Account Statement",
            "references": "Account No: 12345678901",
            "body": "Respected Sir,\n\nWe hereby request you to kindly issue us the account statement for our Current Account mentioned above for the period from 01/01/2026 to 15/01/2026 for our internal accounting and audit purposes.\n\nWe request you to provide the statement at the earliest. We shall be highly obliged for your kind cooperation.\n\nThanking you."
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/pdf", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check Content-Type
        content_type = response.headers.get("Content-Type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got {content_type}"
        
        # Check size > 5KB
        content_length = len(response.content)
        assert content_length > 5000, f"PDF should be > 5KB, got {content_length} bytes"
        
        print(f"PDF generated successfully: {content_length} bytes")
    
    def test_docx_generation_success(self):
        """POST /api/letter-pad/docx generates DOCX with correct Content-Type and size > 5KB"""
        payload = {
            "ref_no": "TEST-DOCX-001",
            "date": "15-01-2026",
            "to_address": "The Branch Manager\nState Bank of India\nKesinga Branch",
            "subject": "Request for Account Statement",
            "references": "Account No: 12345678901",
            "body": "Respected Sir,\n\nWe hereby request you to kindly issue us the account statement for our Current Account mentioned above for the period from 01/01/2026 to 15/01/2026 for our internal accounting and audit purposes.\n\nWe request you to provide the statement at the earliest. We shall be highly obliged for your kind cooperation.\n\nThanking you."
        }
        
        response = requests.post(f"{BASE_URL}/api/letter-pad/docx", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check Content-Type
        content_type = response.headers.get("Content-Type", "")
        assert "openxmlformats" in content_type or "wordprocessingml" in content_type, \
            f"Expected DOCX content type, got {content_type}"
        
        # Check size > 5KB
        content_length = len(response.content)
        assert content_length > 5000, f"DOCX should be > 5KB, got {content_length} bytes"
        
        print(f"DOCX generated successfully: {content_length} bytes")


class TestLetterPadSettings:
    """Tests for Letter Pad Settings endpoint"""
    
    def test_get_settings(self):
        """GET /api/letter-pad/settings returns settings object"""
        response = requests.get(f"{BASE_URL}/api/letter-pad/settings")
        assert response.status_code == 200
        
        settings = response.json()
        # Verify expected fields exist
        expected_fields = [
            "gstin", "phone", "phone_secondary", "address", "email",
            "license_number", "signature_name", "signature_designation",
            "ai_enabled", "has_gemini_key", "has_openai_key", "ai_provider"
        ]
        for field in expected_fields:
            assert field in settings, f"Settings missing field: {field}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
