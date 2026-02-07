# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['run_native.py'],
    pathex=[],
    binaries=[],
    datas=[('app', 'app'), ('internal.env', '.'), ('/Users/vihaan/Developer/active/Surf/backend/.venv/lib/python3.11/site-packages/browser_use/agent/system_prompts', 'browser_use/agent/system_prompts')],
    hiddenimports=['uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.lifespan.on', 'ujson', 'pydantic.deprecated.decorator', 'engineio.async_drivers.aiohttp', 'sqlalchemy.dialects.sqlite', 'aiosqlite', 'browser_use.agent.system_prompts'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='surf-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
