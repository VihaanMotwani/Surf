import os
import subprocess
import sys
import shutil
from pathlib import Path

def build():
    # Ensure pyinstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("PyInstaller not found. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Locate browser_use system_prompts for data inclusion
    import browser_use
    browser_use_dir = Path(browser_use.__file__).parent
    system_prompts_dir = browser_use_dir / "agent" / "system_prompts"
    if not system_prompts_dir.exists():
        print(f"WARNING: browser_use system_prompts not found at {system_prompts_dir}")

    backend_dir = Path(__file__).parent.resolve()
    dist_dir = backend_dir / "dist"
    build_dir = backend_dir / "build"
    
    # Clean previous builds
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)
        
    # Copy .env to internal.env to avoid IsADirectoryError issues with PyInstaller
    env_file = backend_dir / ".env"
    internal_env_file = backend_dir / "internal.env"
    if env_file.exists():
        shutil.copy(env_file, internal_env_file)
        
    cmd = [
        "pyinstaller",
        "--name=surf-backend",
        "--clean",
        "--noconfirm",
        "--onefile",  # Create a single executable
        
        # Hidden imports often needed for uvicorn/fastapi/sqlalchemy
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=ujson",
        "--hidden-import=pydantic.deprecated.decorator",
        "--hidden-import=engineio.async_drivers.aiohttp",
        "--hidden-import=sqlalchemy.dialects.sqlite",
        "--hidden-import=aiosqlite",
        "--hidden-import=browser_use.agent.system_prompts", # Explicitly import the missing module
        
        # Collect all app files
        "--add-data=app:app",
        "--add-data=internal.env:.", # Include internal.env file in root
        f"--add-data={system_prompts_dir}:browser_use/agent/system_prompts", # Include system prompts markdown files        
        # Main entry point
        "run_native.py"
    ]
    
    print(f"Running PyInstaller in {backend_dir}...")
    subprocess.check_call(cmd, cwd=backend_dir)
    
    # Cleanup internal.env
    if internal_env_file.exists():
        os.remove(internal_env_file)
    
    print("Build complete!")
    print(f"Executable is at: {dist_dir / 'surf-backend'}")

if __name__ == "__main__":
    build()
