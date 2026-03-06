"""
Utility functions for auto calculations
"""
from datetime import datetime, timezone, timedelta


def calculate_auto_fields(data: dict) -> dict:
    """Calculate automatic fields based on input data"""
    kg = data.get('kg', 0) or 0
    gbw_cut = data.get('gbw_cut', 0) or 0
    disc_dust_poll = data.get('disc_dust_poll', 0) or 0
    plastic_bag = data.get('plastic_bag', 0) or 0
    cutting_percent = data.get('cutting_percent', 0) or 0
    moisture = data.get('moisture', 0) or 0
    
    # P.Pkt cut calculation (0.5 kg per plastic bag)
    p_pkt_cut = round(plastic_bag * 0.5, 2)
    data['p_pkt_cut'] = p_pkt_cut
    
    # Mill W in KG and QNTL
    mill_w_kg = kg - gbw_cut
    mill_w_qntl = mill_w_kg / 100
    
    # Moisture cut: 17% tak no cut, uske upar (moisture - 17)% cut from Mill W QNTL
    moisture_cut_percent = max(0, moisture - 17)
    moisture_cut_qntl = round((mill_w_qntl * moisture_cut_percent) / 100, 2)
    moisture_cut_kg = round(moisture_cut_qntl * 100, 2)
    data['moisture_cut'] = moisture_cut_kg
    data['moisture_cut_qntl'] = moisture_cut_qntl
    data['moisture_cut_percent'] = moisture_cut_percent
    
    # Cutting from Mill W QNTL
    cutting_qntl = round((mill_w_qntl * cutting_percent) / 100, 2)
    cutting_kg = round(cutting_qntl * 100, 2)
    data['cutting'] = cutting_kg
    data['cutting_qntl'] = cutting_qntl
    
    # P.Pkt cut in QNTL
    p_pkt_cut_qntl = p_pkt_cut / 100
    
    # Disc/Dust/Poll in QNTL
    disc_dust_poll_qntl = disc_dust_poll / 100
    
    # Auto calculations
    data['qntl'] = round(kg / 100, 2)
    data['mill_w'] = mill_w_kg
    
    # Final W = Mill W QNTL - P.Pkt QNTL - Moisture Cut QNTL - Cutting QNTL - Disc/Dust QNTL
    final_w_qntl = mill_w_qntl - p_pkt_cut_qntl - moisture_cut_qntl - cutting_qntl - disc_dust_poll_qntl
    data['final_w'] = round(final_w_qntl * 100, 2)
    
    return data


def can_edit_entry(entry: dict, username: str, role: str) -> tuple:
    """Check if user can edit/delete entry"""
    if role == "admin":
        return True, "Admin access"
    
    # Staff can only edit their own entries within 5 minutes
    if entry.get('created_by') != username:
        return False, "Aap sirf apni entry edit kar sakte hain"
    
    created_at = entry.get('created_at', '')
    if created_at:
        try:
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            time_diff = now - created_time
            
            if time_diff > timedelta(minutes=5):
                return False, "5 minute se zyada ho gaye, ab edit nahi ho sakta"
        except Exception:
            pass
    
    return True, "Edit allowed"


def get_current_kms_year():
    """Get current KMS year based on date"""
    now = datetime.now()
    year = now.year
    month = now.month
    
    # KMS year runs from April to March
    if month >= 4:
        return f"{year}-{year + 1}"
    else:
        return f"{year - 1}-{year}"


def get_current_season():
    """Get current season based on month"""
    month = datetime.now().month
    # Kharif: June-November, Rabi: December-May
    if 6 <= month <= 11:
        return "Kharif"
    else:
        return "Rabi"
