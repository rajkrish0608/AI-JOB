import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing SUPABASE credentials in .env")
    exit(1)

supabase: Client = create_client(url, key)

email = "demo@aijobapply.com"

# Admin confirmation of the user
try:
    # Get user by email to find ID
    users = supabase.auth.admin.list_users()
    target_user = next((u for u in users if u.email == email), None)
    
    if target_user:
        print(f"Found user: {target_user.id}. Confirming...")
        supabase.auth.admin.update_user_by_id(
            target_user.id,
            {"email_confirm": True}
        )
        print(f"Successfully confirmed {email}!")
    else:
        print(f"User {email} not found in Supabase Auth.")
except Exception as e:
    print(f"Error: {e}")
