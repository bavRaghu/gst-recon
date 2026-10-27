import requests
import socketserver
import threading
import sys

BASE_URL = "http://127.0.0.1:8000"

class MiniSMTPHandler(socketserver.StreamRequestHandler):
    def handle(self):
        self.wfile.write(b"220 127.0.0.1 Simple Mail Server ready\r\n")
        self.wfile.flush()
        while True:
            line = self.rfile.readline()
            if not line:
                break
            cmd = line.decode("utf-8", errors="ignore").upper()
            if cmd.startswith("QUIT"):
                self.wfile.write(b"221 2.0.0 Bye\r\n")
                self.wfile.flush()
                break
            elif cmd.startswith("DATA"):
                self.wfile.write(b"354 Start mail input; end with <CRLF>.<CRLF>\r\n")
                self.wfile.flush()
                while True:
                    data_line = self.rfile.readline()
                    if data_line == b".\r\n" or not data_line:
                        break
                self.wfile.write(b"250 2.0.0 OK message queued\r\n")
                self.wfile.flush()
            else:
                self.wfile.write(b"250 2.0.0 OK\r\n")
                self.wfile.flush()

def start_smtp_server():
    server = socketserver.TCPServer(("127.0.0.1", 1025), MiniSMTPHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    return server

def run_e2e_verification():
    print("--- 1. Check Backend Health ---")
    resp = requests.get(f"{BASE_URL}/api/health")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    print("Health check OK:", resp.json())

    print("\n--- 2. Upload Sample Purchase Register and GSTR-2B ---")
    pr_csv = (
        "supplier_gstin,invoice_number,invoice_date,taxable_value,cgst,sgst,igst\n"
        "27AABCT3421M1Z2,INV-E2E-001,2026-09-01,10000.00,900.00,900.00,0.00\n" # Exact match
        "27AABCT3421M1Z2,INV-E2E-002,2026-09-05,25000.00,2250.00,2250.00,0.00\n" # Missing in 2B (Major)
        "29XYZAB1234C1Z5,INV-E2E-003,2026-09-10,35000.00,3150.00,3150.00,0.00\n" # Mismatch (Taxable diff 5000 -> Major)
        "27AABCT3421M1Z2,INV-E2E-004,2026-09-12,15010.00,1350.00,1350.00,0.00\n" # Mismatch (Taxable diff 10 -> Minor)
    )
    twob_csv = (
        "supplier_gstin,invoice_number,invoice_date,taxable_value,cgst,sgst,igst\n"
        "27AABCT3421M1Z2,INV-E2E-001,2026-09-01,10000.00,900.00,900.00,0.00\n" # Exact match
        "29XYZAB1234C1Z5,INV-E2E-003,2026-09-10,30000.00,2700.00,2700.00,0.00\n" # Mismatch
        "27AABCT3421M1Z2,INV-E2E-004,2026-09-12,15000.00,1350.00,1350.00,0.00\n" # Mismatch
    )

    files = {
        "purchase_register": ("purchase_register.csv", pr_csv.encode("utf-8"), "text/csv"),
        "gstr2b": ("gstr2b.csv", twob_csv.encode("utf-8"), "text/csv"),
    }
    upload_resp = requests.post(f"{BASE_URL}/api/reconciliation/upload", files=files)
    assert upload_resp.status_code == 200, f"Upload failed: {upload_resp.text}"
    job_id = upload_resp.json()["job_id"]
    print(f"Uploaded successfully. Job ID: {job_id}")

    print("\n--- 3. Run Reconciliation ---")
    recon_resp = requests.post(f"{BASE_URL}/api/reconciliation/{job_id}/run", json={"tolerance": 1.0})
    assert recon_resp.status_code == 200, f"Recon failed: {recon_resp.text}"
    recon_data = recon_resp.json()
    summary = recon_data["summary"]
    print(f"Reconciliation completed. Summary: Matched={summary['matched']}, Mismatched={summary['mismatched']}, Missing2B={summary['missing_in_gstr2b']}")

    print("\n--- 4. Verify Discrepancies and Summary API ---")
    disc_summary_resp = requests.get(f"{BASE_URL}/api/reconciliation/jobs/{job_id}/discrepancies/summary")
    assert disc_summary_resp.status_code == 200, f"Summary failed: {disc_summary_resp.text}"
    disc_summary = disc_summary_resp.json()
    print("Discrepancies Summary:", disc_summary)
    assert disc_summary["total_discrepancies"] == 3  # 002, 003, 004
    assert disc_summary["major_count"] == 2          # 002 (Missing 2B) and 003 (5000 diff)
    assert disc_summary["minor_count"] == 1          # 004 (10 diff)
    assert disc_summary["pending_verification_count"] == 3
    assert disc_summary["requires_vendor_action_count"] == 0

    discs_resp = requests.get(f"{BASE_URL}/api/reconciliation/jobs/{job_id}/discrepancies")
    assert discs_resp.status_code == 200
    discs = discs_resp.json()
    assert len(discs) == 3
    for d in discs:
        assert d["verification_status"] == "PENDING"
        assert d["requires_vendor_action"] is False
        assert len(d["audit_logs"]) >= 1

    print("\n--- 5. Verify Strict Gating for Vendor Communications (Initial State) ---")
    vc_resp = requests.get(f"{BASE_URL}/api/reconciliation/vendor-communications?job_id={job_id}")
    assert vc_resp.status_code == 200
    vc_items = vc_resp.json()
    print(f"Vendor communication items before verification: {len(vc_items)} (Expected: 0)")
    assert len(vc_items) == 0, "Unverified discrepancies must NOT appear in Vendor Communications!"

    print("\n--- 6. Test Human Verification: Reject Minor for Vendor Action ---")
    minor_disc = next(d for d in discs if d["severity"] == "MINOR")
    reject_vc_resp = requests.post(
        f"{BASE_URL}/api/reconciliation/discrepancies/{minor_disc['id']}/verify",
        json={"action": "REQUIRE_VENDOR_CORRECTION", "reviewer_name": "Auditor"},
    )
    assert reject_vc_resp.status_code == 400
    print("Security check passed: Setting MINOR discrepancy to REQUIRE_VENDOR_CORRECTION was correctly rejected with 400.")

    print("\n--- 7. Human Reviewer Approves Minor Discrepancy ---")
    approve_resp = requests.post(
        f"{BASE_URL}/api/reconciliation/discrepancies/{minor_disc['id']}/verify",
        json={"action": "APPROVE", "reviewer_name": "Ramesh Kulkarni", "comments": "Minor rounding difference accepted."},
    )
    assert approve_resp.status_code == 200
    approved_item = approve_resp.json()["discrepancy"]
    assert approved_item["verification_status"] == "APPROVED"
    assert approved_item["requires_vendor_action"] is False
    print("Minor discrepancy verified as APPROVED.")

    print("\n--- 8. Human Reviewer Qualifies Major Discrepancy for Vendor Correction ---")
    major_disc = next(d for d in discs if d["invoice_number"] == "INV-E2E-002")
    verify_vc_resp = requests.post(
        f"{BASE_URL}/api/reconciliation/discrepancies/{major_disc['id']}/verify",
        json={"action": "REQUIRE_VENDOR_CORRECTION", "reviewer_name": "Ramesh Kulkarni", "comments": "Missing invoice. Supplier must upload before 11th."},
    )
    assert verify_vc_resp.status_code == 200
    vc_qualified = verify_vc_resp.json()["discrepancy"]
    assert vc_qualified["verification_status"] == "REQUIRES_VENDOR_CORRECTION"
    assert vc_qualified["requires_vendor_action"] is True
    print("Major discrepancy verified as REQUIRES_VENDOR_CORRECTION.")

    print("\n--- 9. Verify Vendor Communications List (After Human Verification) ---")
    vc_resp2 = requests.get(f"{BASE_URL}/api/reconciliation/vendor-communications?job_id={job_id}")
    assert vc_resp2.status_code == 200
    vc_items2 = vc_resp2.json()
    print(f"Vendor communication items after verification: {len(vc_items2)} (Expected: 1)")
    assert len(vc_items2) == 1
    assert vc_items2[0]["invoice_number"] == "INV-E2E-002"
    assert vc_items2[0]["severity"] == "major"
    print("Only the verified MAJOR discrepancy appears in Vendor Communication!")

    print("\n--- 10. Save Draft and Dispatch Notice in Test Mode ---")
    target_result_id = vc_items2[0]["result_id"]
    draft_resp = requests.post(
        f"{BASE_URL}/api/reconciliation/vendor-communications/{target_result_id}/draft",
        json={
            "recipient_email": "test-receiver@gst-recon.local",
            "subject": "URGENT: Missing Invoice INV-E2E-002",
            "body": "Please upload to GSTR-1 prior to 11th.",
            "template_type": "urgent",
        },
    )
    assert draft_resp.status_code == 200
    print("Draft saved successfully.")

    send_resp = requests.post(
        f"{BASE_URL}/api/reconciliation/vendor-communications/{target_result_id}/send",
        json={
            "recipient_email": "test-receiver@gst-recon.local",
            "subject": "URGENT: Missing Invoice INV-E2E-002",
            "body": "Please upload to GSTR-1 prior to 11th.",
            "template_type": "urgent",
        },
    )
    if send_resp.status_code != 200:
        print("Send response status:", send_resp.status_code, "text:", send_resp.text)
    assert send_resp.status_code == 200
    send_data = send_resp.json()
    print("Notice dispatch response:", send_data["message"], "| Mode:", send_data["smtp_mode"])

    print("\n=======================================================")
    print("ALL END-TO-END VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    print("=======================================================")

if __name__ == "__main__":
    smtp = start_smtp_server()
    print("Mini SMTP server listening on 127.0.0.1:1025 for test dispatch.")
    run_e2e_verification()
    smtp.shutdown()
