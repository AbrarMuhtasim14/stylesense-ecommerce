import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv()

from supabase import create_client

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
client = create_client(url, key)

try:
    # Try inserting a profile
    test_data = {"email": "test_auth_inspect@example.com", "name": "Test Inspector"}
    res = client.table("profiles").insert(test_data).execute()
    print("Insert success! Inserted data:")
    print(res.data)
    
    # Cleanup
    client.table("profiles").delete().eq("email", "test_auth_inspect@example.com").execute()
    print("Cleanup success!")
except Exception as e:
    print("Error doing insert/delete:", e)

