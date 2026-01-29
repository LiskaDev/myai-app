"""
MyAI-RolePlay - AI 角色扮演聊天室后端
基于 FastAPI 的流式转发服务

作者: MyAI-RolePlay Team
"""

import json
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

# ============== 应用初始化 ==============
app = FastAPI(
    title="MyAI-RolePlay",
    description="AI 角色扮演聊天室 - 移动端优先",
    version="1.0.0"
)

# ============== CORS 配置 ==============
# 允许所有来源访问，便于移动端测试
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为特定域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== 路径配置 ==============
# 获取当前文件所在目录
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

# ============== 挂载静态文件 ==============
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ============== 数据模型 ==============
class Message(BaseModel):
    """单条消息模型"""
    role: str  # 'system', 'user', 'assistant'
    content: str


class ChatRequest(BaseModel):
    """聊天请求模型"""
    messages: list[Message]  # 消息列表 (包含 system prompt)
    model: str = "deepseek-chat"  # 模型名称
    base_url: str = "https://api.deepseek.com"  # API 基础 URL
    api_key: str  # API 密钥
    temperature: float = 1.0  # 温度参数 (0.0-2.0)
    max_tokens: int = 2000  # 最大生成 token 数


# ============== 路由 ==============
@app.get("/", response_class=HTMLResponse)
async def index():
    """
    首页 - 直接返回 HTML 文件 (避免 Jinja2 与 Vue 模板语法冲突)
    """
    html_path = TEMPLATES_DIR / "index.html"
    return FileResponse(html_path, media_type="text/html")


@app.post("/chat")
async def chat(chat_request: ChatRequest):
    """
    流式聊天接口 - 转发请求到 OpenAI 兼容 API
    
    工作流程:
    1. 接收前端请求，组装 API 调用参数
    2. 使用 httpx 异步流式请求目标 API
    3. 逐块转发响应数据到前端
    """
    
    # 构建 API 请求 URL (兼容 OpenAI 格式)
    api_url = f"{chat_request.base_url.rstrip('/')}/v1/chat/completions"
    
    # 构建请求头
    headers = {
        "Authorization": f"Bearer {chat_request.api_key}",
        "Content-Type": "application/json",
    }
    
    # 构建请求体 (OpenAI 兼容格式)
    payload = {
        "model": chat_request.model,
        "messages": [msg.model_dump() for msg in chat_request.messages],
        "temperature": chat_request.temperature,
        "max_tokens": chat_request.max_tokens,
        "stream": True,  # 启用流式响应
    }
    
    async def generate():
        """
        异步生成器 - 流式转发 API 响应
        
        SSE (Server-Sent Events) 格式:
        - 每行以 "data: " 开头
        - 数据为 JSON 格式
        - 结束标记为 "data: [DONE]"
        """
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    api_url,
                    headers=headers,
                    json=payload,
                ) as response:
                    # 检查响应状态
                    if response.status_code != 200:
                        error_text = await response.aread()
                        error_msg = f"API Error: {response.status_code} - {error_text.decode()}"
                        yield f"data: {json.dumps({'error': error_msg})}\n\n"
                        return
                    
                    # 逐行读取流式响应
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            # 直接转发 SSE 数据
                            yield f"{line}\n\n"
                            
                            # 检查是否结束
                            if line == "data: [DONE]":
                                break
                                
        except httpx.TimeoutException:
            yield f"data: {json.dumps({'error': '请求超时，请稍后重试'})}\n\n"
        except httpx.RequestError as e:
            yield f"data: {json.dumps({'error': f'网络错误: {str(e)}'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': f'服务器错误: {str(e)}'})}\n\n"
    
    # 返回流式响应
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 Nginx 缓冲
        }
    )


# ============== 健康检查 ==============
@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "service": "MyAI-RolePlay"}


# ============== 启动入口 ==============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # 开发模式热重载
    )
