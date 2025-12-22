<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 333 RAG 知識庫聊天系統

基於 Gemini File Search API 打造的智能知識庫管理與對話系統，支援多用戶認證與數據隔離。

## 功能特色

- 🗂️ **知識庫管理**：創建多個獨立的知識空間（Knowledge Space）
- 📄 **文件上傳**：支援多種文件格式的上傳與索引
- 💬 **RAG 對話**：基於文件內容的智能問答
- 🔌 **OpenAI 兼容 API**：每個知識空間可生成 OpenAI 格式的 API 接口
- 🔑 **API Key 管理**：自動為每個空間生成唯一的 API Key
- 💾 **對話記錄**：自動保存每個空間的聊天歷史
- 👥 **多用戶系統**：支援用戶認證與管理員控制台
- 🔒 **數據隔離**：每個用戶只能看到和管理自己的知識空間

## 本機運行

**前置需求：** Node.js

1. 安裝依賴套件：
   ```bash
   npm install
   ```

2. 設定環境變數（複製環境變數範本）：
   ```bash
   cp .env.example .env
   ```
   
   編輯 `.env` 設定以下資訊：
   - `GEMINI_API_KEY`：你的 Gemini API Key（可在網頁界面輸入）
   - `ADMIN_USERNAME`：管理員帳號（預設：admin）
   - `ADMIN_PASSWORD`：管理員密碼（預設：admin123）

3. 啟動應用程式：
   
   **開發環境**（前端 Vite + 後端 Express，雙端口）：
   ```bash
   npm run dev
   ```
   - 前端：http://localhost:3000（自動代理 API 請求到 3002）
   - 後端：http://localhost:3002
   
   **生產環境**（單一 Express 服務器，單端口）：
   ```bash
   npm start
   ```
   - 統一端口：http://localhost:3000（前端 + API）

4. 首次登入：
   - 開啟瀏覽器訪問 `http://localhost:3000`
   - 使用管理員帳號登入（預設：admin / admin123）
   - 在管理控制台創建用戶帳號

## 用戶管理

### 管理員操作

管理員登入後可以：
1. 查看所有用戶列表
2. 創建新用戶（設定用戶名、密碼、角色）
3. 刪除用戶
4. 查看每個用戶的知識空間數量

### 普通用戶操作

普通用戶登入後可以：
1. 創建自己的知識空間
2. 上傳文件到知識空間
3. 與知識庫進行對話
4. 為每個空間生成 API Key
5. 設定自己的 Gemini API Key（會自動儲存到後端）

### Gemini API Key 管理

- **持久化儲存**：用戶輸入的 Gemini API Key 會同時儲存到：
  - 前端 localStorage（快速載入）
  - 後端 JSON 文件（data/users.json，持久化）
  
- **自動載入**：用戶登入時自動載入已儲存的 API Key

- **用戶隔離**：每個用戶可以使用自己的 Gemini API Key，實現完全的數據隔離

- **數據安全**：
  - API Key 僅限用戶本人或管理員可以修改
  - Docker 部署時，掛載 `data/` 目錄確保數據持久化

### 數據隔離機制

- 每個用戶創建的知識空間會自動加上用戶名前綴（例如：`username_spacename`）
- 用戶只能看到和管理自己的知識空間
- API Key 與用戶綁定，確保數據安全

## 架構設計

### 開發環境（雙端口）
```
用戶瀏覽器
    ↓
Vite 開發服務器 (3000)
    ├── 前端頁面（熱重載）
    └── /api/* → 自動代理 → Express (3002)
```

**優點**：
- ✅ 保留 Vite 熱重載功能
- ✅ 前端請求使用相對路徑 `/api/*`
- ✅ 無需 CORS 配置

### 生產環境（單端口）
```
用戶瀏覽器
    ↓
Express (3000)
    ├── /api/* → API 邏輯
    └── /* → 靜態文件 (dist/)
```

**優點**：
- ✅ 只有一個端口 3000
- ✅ SSL 只需配置一次
- ✅ 標準的 Node.js 部署方式
- ✅ Docker 容器更簡潔

## Docker 部署

### 方式一：使用 Docker Build（推薦給習慣命令行的用戶）

1. 創建 `.env` 檔案並設定環境變數：
   ```bash
   cp .env.example .env
   ```
   
   編輯 `.env` 設定：
   - `GEMINI_API_KEY`：你的 Gemini API Key
   - `ADMIN_USERNAME`：管理員帳號
   - `ADMIN_PASSWORD`：管理員密碼

2. 建立 Docker 映像：
   ```bash
   docker build -t rag-chat-2025:latest .
   ```

3. 運行容器：
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     --env-file .env \
     --name rag-chat-2025 \
     rag-chat-2025:latest
   ```
   
   **注意**：
   - Docker 使用生產模式，**只需要 3000 單一端口**（前端 + API）
   - 使用 `-v $(pwd)/data:/app/data` 掛載數據目錄，確保用戶數據持久化

4. 查看日誌：
   ```bash
   docker logs -f rag-chat-2025
   ```

5. 停止並移除容器：
   ```bash
   docker stop rag-chat-2025
   docker rm rag-chat-2025
   ```

6. 重新啟動已存在的容器：
   ```bash
   docker start rag-chat-2025
   ```

### 方式二：使用 Docker Compose（適合快速啟動）

1. 確保已安裝 Docker 和 Docker Compose

2. 創建 `.env` 檔案並設定 API Key：
   ```bash
   cp .env.example .env
   # 編輯 .env 填入你的 GEMINI_API_KEY
   ```

3. 啟動容器：
   ```bash
   docker-compose up -d
   ```

4. 停止容器：
   ```bash
   docker-compose down
   ```

### 訪問應用程式

無論使用哪種方式，啟動後訪問：

**開發環境**：
- **前端界面**：http://localhost:3000（Vite 自動代理 API 請求到 3002）
- **API Server**：http://localhost:3002（只提供 API）

**生產/Docker 環境**：
- **單一端口**：http://localhost:3000（包含前端 + API）
- 所有請求統一由 Express 處理，SSL 只需配置一次

### Docker 映像特點

- 🐳 **基底映像**: Node.js 20 LTS Alpine（穩定且輕量，約 180MB）
- 🔒 **安全**: 使用非 root 用戶運行
- ⚡ **優化**: Multi-stage build 減少映像大小
- 🎯 **生產就緒**: 包含 dumb-init 處理信號

## OpenAI 兼容 API 使用說明

每個知識空間都可以生成 OpenAI 兼容的 API 接口：

1. 進入任一知識空間
2. 點擊側邊欄的「生成 API Key」按鈕
3. 複製顯示的 Endpoint URL 和 API Key
4. 在任何支援 OpenAI API 的工具中使用

### 重要概念

- **所有空間共用同一個 Endpoint**：`http://localhost:3000/v1/chat/completions`
- **每個空間有唯一的 API Key**：`grag-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Server 會根據 API Key 自動識別並使用對應空間的文件庫**
- **生產環境單一端口**：SSL 證書只需配置一次

### 使用範例

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "你的問題"}
    ]
  }'
```

### 兼容工具

此 API 可用於任何支援 OpenAI API 的工具：
- Cursor AI
- Continue.dev
- LibreChat
- 其他支援自定義 OpenAI endpoint 的應用

---

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Wfv9mVFth8vC4qF2aXcYPSp6y-jp240-

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in `.env` (copy from `.env.example`), or set it in the UI:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. Run the app:
   
   **Development** (Vite + Express, dual ports):
   ```bash
   npm run dev
   ```
   - Frontend: http://localhost:3000 (auto-proxies API to 3002)
   - Backend: http://localhost:3002
   
   **Production** (Single Express server, single port):
   ```bash
   npm start
   ```
   - Unified port: http://localhost:3000 (Frontend + API)

## Docker Deployment

### Method 1: Using Docker Build (Recommended for CLI users)

1. Create `.env` file and set your API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

2. Build Docker image:
   ```bash
   docker build -t rag-chat-2025:latest .
   ```

3. Run container:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -v $(pwd)/data:/app/data \
     --env-file .env \
     --name rag-chat-2025 \
     rag-chat-2025:latest
   ```
   
   **Note**:
   - Docker uses production mode, **only port 3000 needed** (Frontend + API)
   - Use `-v $(pwd)/data:/app/data` to mount data directory for persistence

4. View logs:
   ```bash
   docker logs -f rag-chat-2025
   ```

5. Stop and remove container:
   ```bash
   docker stop rag-chat-2025
   docker rm rag-chat-2025
   ```

6. Restart existing container:
   ```bash
   docker start rag-chat-2025
   ```

### Method 2: Using Docker Compose (Quick start)

1. Make sure Docker and Docker Compose are installed

2. Create `.env` file and set your API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. Start containers:
   ```bash
   docker-compose up -d
   ```

4. Stop containers:
   ```bash
   docker-compose down
   ```

### Access Application

After starting with either method:

**Development Environment**:
- **Frontend**: http://localhost:3000 (Vite auto-proxies API requests to 3002)
- **API Server**: http://localhost:3002 (API only)

**Production/Docker Environment**:
- **Single Port**: http://localhost:3000 (Frontend + API)
- All requests handled by Express, SSL only needs one configuration

### Docker Image Features

- 🐳 **Base Image**: Node.js 20 LTS Alpine (stable and lightweight, ~180MB)
- 🔒 **Security**: Runs as non-root user
- ⚡ **Optimized**: Multi-stage build for smaller image size
- 🎯 **Production Ready**: Includes dumb-init for proper signal handling

## OpenAI Compatible API

Each Knowledge Space can generate an OpenAI-compatible API endpoint:

1. Enter a Space
2. Click "生成 API Key" in the sidebar
3. Copy the endpoint URL and API key
4. Use it with any OpenAI-compatible tool

### Key Concept

- **All spaces share the same Endpoint**: `http://localhost:3000/v1/chat/completions`
- **Each space has a unique API Key**: `grag-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Server automatically identifies and uses the corresponding space's document library based on the API Key**
- **Production single-port architecture**: SSL certificate only needs one configuration

Example usage:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [
      {"role": "user", "content": "Your question"}
    ]
  }'
```
