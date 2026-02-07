import multiprocessing
import os
import sys
from dotenv import load_dotenv

import uvicorn

# Add the current directory to sys.path to ensure modules can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    # PyInstaller adds this attribute to sys
    if getattr(sys, 'frozen', False):
        # If the application is run as a bundle, the PyInstaller bootloader
        # extends the sys module by a flag frozen=True and sets the app 
        # path into variable _MEIPASS'.
        application_path = sys._MEIPASS
    else:
        application_path = os.path.dirname(os.path.abspath(__file__))
    
    # Load .env file
    # Check potential locations for internal.env (renamed from .env to avoid dir issues)
    potential_paths = [
        os.path.join(application_path, 'internal.env'),
        os.path.join(application_path, '.env'), # Fallback
    ]
    env_path = None
    for p in potential_paths:
        if os.path.exists(p) and not os.path.isdir(p):
            env_path = p
            break
            
    if env_path:
        print(f"[DEBUG-v2] Found env file at {env_path}")
        try:
            with open(env_path, 'r') as f:
                content = f.read()
                print(f"[DEBUG-v2] env content check: Length={len(content)}")
        except Exception as e:
            print(f"[DEBUG-v2] Could not read env file: {e}")
    else:
        print(f"[DEBUG-v2] env file NOT found. Checked: {potential_paths}")
        # List contents of application_path to debug
        try:
            print(f"[DEBUG-v2] Contents of {application_path}: {os.listdir(application_path)}")
        except Exception as e:
             print(f"[DEBUG-v2] Could not list contents: {e}")

    if env_path:
        # Explicitly verify OPENAI_API_KEY presence in file content before load_dotenv
        with open(env_path, 'r') as f:
            if 'OPENAI_API_KEY' in f.read():
                 print("[DEBUG-v2] OPENAI_API_KEY found in env file content")
            else:
                 print("[DEBUG-v2] OPENAI_API_KEY NOT found in env file content")

        load_dotenv(env_path, override=True) # Force override to ensure we use the bundled env
    
    if os.getenv("OPENAI_API_KEY"):
        print("[DEBUG-v2] OPENAI_API_KEY loaded successfully (value masked)")
        # Double check value length to ensure it's not empty
        print(f"[DEBUG-v2] OPENAI_API_KEY length: {len(os.getenv('OPENAI_API_KEY'))}")
    else:
        print("[DEBUG-v2] OPENAI_API_KEY NOT found in environment after load_dotenv. Attempting manual parse.")
        if env_path:
            try:
                with open(env_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('OPENAI_API_KEY='):
                            key = line.split('=', 1)[1].strip().strip('"').strip("'")
                            os.environ['OPENAI_API_KEY'] = key
                            print("[DEBUG-v2] OPENAI_API_KEY loaded manually")
                            break
            except Exception as e:
                print(f"[DEBUG-v2] Manual parse failed: {e}")

    # Necessary for multiprocessing to work (if used)
    multiprocessing.freeze_support()
    
    # Run the uvicorn server
    # Import app explicitly so PyInstaller detects dependencies
    from app.main import app
    uvicorn.run(app, host="127.0.0.1", port=8000)
