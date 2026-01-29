import urllib.request
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

files_to_download = [
    {
        "url": "https://unpkg.com/vue@3/dist/vue.global.prod.js",
        "filename": "vue.global.prod.js"
    },
    {
        "url": "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
        "filename": "marked.min.js"
    }
]

for file_info in files_to_download:
    url = file_info["url"]
    filename = file_info["filename"]
    filepath = STATIC_DIR / filename
    
    print(f"正在下载: {url}")
    
    try:
        urllib.request.urlretrieve(url, filepath)
        file_size = os.path.getsize(filepath)
        print(f"✅ 已下载: {filename} ({file_size} bytes)")
    except Exception as e:
        print(f"❌ 下载失败: {filename}")
        print(f"   错误: {e}")

print("\n下载完成！")
