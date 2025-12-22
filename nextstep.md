# Next Steps - 開發改進計劃

## 問題檢討總結

本次開發過程中遇到多個問題，主要根源在於**前端狀態管理混亂**和**數據來源不一致**，而非技術選型（JSON vs 資料庫）的問題。

---

## 主要問題分析

### 1. 前端狀態管理混亂 ⭐⭐⭐⭐⭐ (最嚴重)

**問題表現**：
- `isApiKeySelected`、`currentUser`、`stores` 等狀態之間的依賴關係不清晰
- 登出時沒有清除 `geminiService` 的模組級變數，導致下一個用戶繼承上一個用戶的 API Key
- `refreshStores` 依賴多個狀態，但這些狀態的更新順序和時機不一致
- 初始化邏輯散落在 `useEffect`、`handleLogin`、`attemptAutoLogin` 多處，難以追蹤

**改進方案**：
- [ ] 使用 **React Context** 或 **Zustand/Redux** 統一管理全局狀態
- [ ] 將 `geminiService` 改為 **class instance**，而不是模組級單例，每個用戶有獨立實例
- [ ] 使用 **狀態機** (如 XState) 明確定義 `Initializing -> Welcome -> Manager -> Chatting` 的轉換條件

---

### 2. 數據來源不一致 ⭐⭐⭐⭐

**問題表現**：
- `displayName` 同時存在於三個地方，但互相不同步：
  1. Gemini API 返回的 `displayName`（不可靠）
  2. `api-keys.json` 中的 `displayName`（可靠）
  3. 前端創建時的 `prefixedName`（可靠）
- 創建 Space 時傳入 `tatung_food`，但 Gemini API 有時返回 `food`
- 前端過濾邏輯依賴 Gemini API 的數據，導致有些 Space 被錯誤過濾掉

**改進方案**：
- [ ] **單一數據源原則**：將 `api-keys.json` 作為唯一的 displayName 來源（已部分實現）
- [ ] 在後端建立 `spaces.json`，明確記錄每個 Space 的 metadata（包括 displayName、owner、createdAt 等）
- [ ] 前端完全不依賴 Gemini API 的 displayName，只使用後端提供的映射

---

### 3. JSON 文件儲存的問題 ⭐⭐⭐

**現狀評估**：
- JSON 文件本身不是問題，但在以下情況下會放大其他問題：
  - Docker 容器重啟時，如果沒有正確掛載 volume，數據會丟失
  - 多個進程同時寫入 JSON 文件可能導致數據損壞（雖然這個專案是單進程）

**是否需要改用 SQLite/PostgreSQL？**
- **短期內不需要**：對於這個規模的應用（單用戶/小團隊），JSON 文件完全夠用
- **長期建議**：如果要支援以下功能，應該改用 SQLite：
  - [ ] 多用戶並發寫入
  - [ ] 複雜查詢（如搜尋、排序、分頁）
  - [ ] 事務支援（確保數據一致性）
  - [ ] 數據量超過 1000 條記錄

---

### 4. Docker 權限問題 ⭐⭐

**問題**：
- 非 root 用戶 (UID 1001) 無法寫入宿主機的 `data/` 目錄

**評估**：
- 這是安全性最佳實踐的副作用，不是設計錯誤
- 解決方案已經正確：在 README 中明確說明需要 `chown -R 1001:1001 data/`

**改進方案**：
- [ ] 在 Dockerfile 中添加啟動腳本，自動檢查並修復權限問題（可選）

---

### 5. 缺乏測試 ⭐⭐⭐⭐

**問題**：
- 沒有單元測試或整合測試，導致每次修改都可能引入新 bug
- 關鍵流程（登入、登出、創建 Space）沒有自動化驗證

**改進方案**：
- [ ] 為關鍵邏輯（如 `handleLogout`、`refreshStores`、`handleLogin`）編寫單元測試
- [ ] 使用 Playwright 或 Cypress 編寫 E2E 測試，覆蓋「登入 -> 創建 Space -> 登出 -> 切換用戶」等關鍵流程

---

## 改進建議優先級

### 🔴 高優先級（立即改進）

1. **重構狀態管理**
   - [ ] 引入 Zustand 或 React Context，統一管理 `auth`、`apiKey`、`stores` 狀態
   - [ ] 將所有狀態更新邏輯集中到一個地方，避免散落在多個組件中

2. **修復 geminiService**
   - [ ] 改為 class instance，避免模組級狀態污染
   - [ ] 每個用戶登入時創建獨立的 service instance
   - [ ] 登出時銷毀 instance

3. **建立 spaces.json**
   - [ ] 作為 Space metadata 的單一數據源
   - [ ] 記錄 `spaceName`、`displayName`、`owner`、`createdAt`、`geminiResourceId` 等信息
   - [ ] 前端完全依賴此文件，不再依賴 Gemini API 的不可靠數據

---

### 🟡 中優先級（下個版本）

1. **添加基礎測試**
   - [ ] 至少為登入/登出流程編寫測試
   - [ ] 為 Space 創建和過濾邏輯編寫測試

2. **改進錯誤處理**
   - [ ] 統一錯誤處理邏輯，避免 `try-catch` 散落各處
   - [ ] 建立錯誤邊界組件，防止整個應用崩潰

3. **優化初始化流程**
   - [ ] 簡化 `useEffect` 中的初始化邏輯
   - [ ] 使用狀態機明確定義各個狀態之間的轉換條件

---

### 🟢 低優先級（長期規劃）

1. **遷移到 SQLite**
   - [ ] 當用戶數 > 10 或 Space 數 > 100 時考慮
   - [ ] 使用 Prisma 或 Drizzle ORM 簡化資料庫操作

2. **引入狀態機**
   - [ ] 使用 XState 管理複雜的狀態轉換
   - [ ] 可視化狀態流程，方便調試

3. **性能優化**
   - [ ] 使用 React.memo 和 useMemo 優化渲染性能
   - [ ] 實現虛擬滾動，支援大量 Space 的顯示

---

## 總結

**最大的問題不是 JSON 儲存，而是前端狀態管理混亂**。如果狀態管理清晰，即使用 JSON 文件也不會出現這麼多問題。

**建議優先重構狀態管理邏輯，再考慮是否需要更換資料庫。**

---

## 已修復的問題清單

- [x] Docker 容器重啟後 API Key 丟失（通過 volume 掛載修復）
- [x] 登出後頁面卡在 Initializing 狀態（修改為跳轉到 Welcome）
- [x] Admin 用戶看到其他用戶的 Space（添加 clearApiKey 修復）
- [x] Space 在 JSON 中存在但 UI 不顯示（從後端獲取正確的 displayName）
- [x] 登入頁面閃爍（優先檢查 Initializing 狀態）
- [x] 返回 Manager 頁面時 Space 列表為空（添加 loading 狀態）
- [x] Copy to clipboard 在 HTTP 環境下失效（添加 fallback）
- [x] API Key 無法重新生成（添加 Regenerate Key 按鈕）

---

**最後更新時間**: 2025-12-22
