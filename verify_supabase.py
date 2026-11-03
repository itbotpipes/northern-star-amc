"""
Supabase Storage Connection Verifier
Run this script to test if your Supabase Storage bucket is ready to store photos & voice notes:
    .venv/Scripts/python verify_supabase.py
"""
import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads")

print("=" * 60)
print("SUPABASE STORAGE DIAGNOSTIC & VERIFICATION")
print("=" * 60)
print(f"Supabase URL:    {SUPABASE_URL or '[NOT SET in .env]'}")
print(f"Storage Bucket:  {BUCKET}")
print(f"API Key present: {'YES (' + SUPABASE_KEY[:12] + '...)' if SUPABASE_KEY else 'NO [MISSING in .env]'}")
print("-" * 60)

if not SUPABASE_URL or not SUPABASE_KEY:
    print("\n[!] Please add the following to App_AMC/.env:")
    print("SUPABASE_URL=https://avlemwzetoqhyxzowjoy.supabase.co")
    print("SUPABASE_KEY=<your-service_role-key-from-supabase-dashboard>")
    print("SUPABASE_STORAGE_BUCKET=uploads")
    print("\nHow to get the key:")
    print("1. Open https://supabase.com/dashboard/project/avlemwzetoqhyxzowjoy")
    print("2. Go to Project Settings -> API")
    print("3. Copy the 'service_role' secret key (or 'anon' public key)")
    exit(1)

# Test uploading a small sample audio test file
test_path = "test/connection_test.txt"
upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{test_path}"
headers = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "apikey": SUPABASE_KEY,
    "Content-Type": "text/plain",
    "x-upsert": "true",
}

print(f"Attempting test upload to bucket '{BUCKET}'...")
try:
    resp = requests.post(upload_url, data=b"Supabase Storage is connected and working!", headers=headers, timeout=15)
    if resp.status_code in (200, 201):
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{test_path}"
        print("\n[SUCCESS] Upload test passed! [OK]")
        print(f"Public file URL: {public_url}")
        print("\nYour app is now ready to directly store photos, videos, and voice notes in Supabase Storage!")
    else:
        print(f"\n[ERROR] Upload failed with status {resp.status_code}:")
        print(resp.text)
        if resp.status_code == 404:
            print(f"\nTip: Make sure you created a bucket named '{BUCKET}' in Supabase Dashboard -> Storage.")
        elif resp.status_code in (401, 403):
            print("\nTip: Check that you are using the 'service_role' key or that your bucket has public upload policies.")
except Exception as e:
    print(f"\n[EXCEPTION] Connection error: {e}")
