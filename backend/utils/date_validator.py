"""
Date Format Validator - Startup health check
Scans DB collections for raw YYYY-MM-DD dates that should be formatted as DD-MM-YYYY.
Validates the fmt_date utility works correctly.
"""
import re
import logging

logger = logging.getLogger("server")

YYYY_MM_DD_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')
DD_MM_YYYY_PATTERN = re.compile(r'^\d{2}-\d{2}-\d{4}$')

COLLECTIONS_WITH_DATES = [
    ("mill_entries", ["date"]),
    ("cash_transactions", ["date"]),
    ("private_paddy", ["date"]),
    ("private_payments", ["date"]),
    ("hemali_payments", ["date"]),
    ("diesel_accounts", ["date"]),
    ("gunny_bags", ["date"]),
    ("mill_parts_stock", ["date"]),
    ("dc_entries", ["date", "deadline"]),
    ("dc_deliveries", ["date"]),
    ("msp_payments", ["date"]),
    ("sale_vouchers", ["date"]),
    ("purchase_vouchers", ["date"]),
    ("truck_leases", ["start_date", "end_date"]),
    ("staff_payments", ["date"]),
    ("vehicle_weights", ["date"]),
]


def validate_fmt_date():
    """Validate fmt_date utility works correctly with known test cases."""
    from utils.date_format import fmt_date
    test_cases = [
        ("2026-04-01", "01-04-2026"),
        ("2025-12-31", "31-12-2025"),
        ("2025-01-15", "15-01-2025"),
        ("", ""),
        (None, ""),
        ("01-04-2026", "01-04-2026"),  # already formatted - should pass through
    ]
    results = []
    for input_val, expected in test_cases:
        actual = fmt_date(input_val)
        passed = actual == expected
        if not passed:
            results.append({"input": input_val, "expected": expected, "actual": actual, "status": "FAIL"})
        else:
            results.append({"input": input_val, "expected": expected, "actual": actual, "status": "PASS"})
    return results


async def scan_date_formats(db, sample_size=5):
    """Scan DB collections for date format issues. Returns a report."""
    report = {"collections": {}, "total_raw_dates": 0, "total_ok_dates": 0, "issues": []}

    for coll_name, date_fields in COLLECTIONS_WITH_DATES:
        coll = db[coll_name]
        try:
            docs = await coll.find({}, {"_id": 0}).to_list(length=sample_size)
        except Exception:
            continue

        coll_report = {"sampled": len(docs), "raw_yyyy_mm_dd": 0, "ok_dd_mm_yyyy": 0, "empty": 0, "fields_checked": date_fields}

        for doc in docs:
            for field in date_fields:
                val = doc.get(field, "")
                if not val:
                    coll_report["empty"] += 1
                elif YYYY_MM_DD_PATTERN.match(str(val)):
                    coll_report["raw_yyyy_mm_dd"] += 1
                    report["total_raw_dates"] += 1
                elif DD_MM_YYYY_PATTERN.match(str(val)):
                    coll_report["ok_dd_mm_yyyy"] += 1
                    report["total_ok_dates"] += 1

        report["collections"][coll_name] = coll_report
        if coll_report["raw_yyyy_mm_dd"] > 0:
            report["issues"].append(f"{coll_name}: {coll_report['raw_yyyy_mm_dd']} docs with raw YYYY-MM-DD dates in {date_fields}")

    return report


async def run_startup_date_check(db):
    """Run date format health check at startup. Logs warnings for any issues."""
    try:
        # 1. Validate fmt_date utility
        fmt_results = validate_fmt_date()
        failed = [r for r in fmt_results if r["status"] == "FAIL"]
        if failed:
            logger.error(f"DATE VALIDATOR: fmt_date() FAILED {len(failed)} test cases: {failed}")
        else:
            logger.info("DATE VALIDATOR: fmt_date() utility OK (all test cases passed)")

        # 2. Scan DB for raw dates (note: DB stores raw YYYY-MM-DD, that's normal)
        # The check is that fmt_date can handle them
        report = await scan_date_formats(db, sample_size=3)
        if report["issues"]:
            logger.info(f"DATE VALIDATOR: DB stores {report['total_raw_dates']} raw YYYY-MM-DD dates (normal for storage). fmt_date() will format them on export.")
        else:
            logger.info("DATE VALIDATOR: All date fields scanned OK")

    except Exception as e:
        logger.error(f"DATE VALIDATOR startup check error: {e}")
