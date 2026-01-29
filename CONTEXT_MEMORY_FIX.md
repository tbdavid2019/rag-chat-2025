# 對話上下文記憶修復

## 問題描述

之前的實現中,Gemini File Search 在同一個 session 中無法記住對話上下文。每次查詢都是獨立的,無法進行多輪對話。

### 原因分析

在 `services/geminiService.ts` 的 `fileSearch` 函數中,每次只傳送當前的單一查詢給 Gemini API,沒有包含之前的對話歷史:

```typescript
// 修復前
const response = await ai.models.generateContent({
    model: model,
    contents: query,  // ❌ 只傳送當前查詢,沒有歷史
    config: { ... }
});
```

## 解決方案

### 1. 更新 `geminiService.ts`

修改 `fileSearch` 函數,增加 `chatHistory` 參數,並將完整的對話歷史傳遞給 Gemini API:

```typescript
// 修復後
export async function fileSearch(
    ragStoreName: string, 
    query: string, 
    config?: SpaceConfig,
    chatHistory?: Array<{ role: string; parts: Array<{ text: string }> }>  // ✅ 新增參數
): Promise<QueryResult> {
    // ...
    
    // 構建包含歷史的 contents
    let contents: any;
    if (chatHistory && chatHistory.length > 0) {
        // 轉換聊天歷史為 Gemini 格式
        contents = chatHistory.map(msg => ({
            role: msg.role === 'model' ? 'model' : 'user',
            parts: msg.parts.map(part => ({ text: part.text }))
        }));
        // 添加當前查詢
        contents.push({
            role: 'user',
            parts: [{ text: query }]
        });
    } else {
        contents = query;
    }

    const response = await ai.models.generateContent({
        model: model,
        contents: contents,  // ✅ 傳送完整對話歷史
        config: { ... }
    });
}
```

### 2. 更新 `App.tsx`

在 `handleSendMessage` 函數中,傳遞當前的聊天歷史:

```typescript
// 修復後
const result = await geminiService.fileSearch(
    selectedStore.name, 
    message, 
    currentSpaceConfig,
    chatHistory  // ✅ 傳遞聊天歷史
);
```

## 效果

修復後,Gemini File Search 現在可以:

1. ✅ **記住對話上下文** - 可以理解代詞引用(如「它」、「這個」)
2. ✅ **進行多輪對話** - 可以基於之前的回答進行追問
3. ✅ **更自然的對話體驗** - 就像與真人對話一樣

## 測試建議

1. 開啟一個 Space 並開始對話
2. 問第一個問題,例如:「Ploom X 是什麼?」
3. 問後續問題,例如:「它的價格是多少?」或「在哪裡可以買到?」
4. 驗證 AI 能夠理解「它」指的是 Ploom X

## 技術細節

- **對話格式**: 使用 Gemini API 的標準對話格式,包含 `role` 和 `parts`
- **角色映射**: `user` 保持不變,`model` 對應 AI 的回應
- **向後兼容**: 如果沒有歷史記錄,仍然可以正常工作(單次查詢)
- **持久化**: 對話歷史已經通過 `localStorage` 保存,重新載入頁面後仍然有效

## 注意事項

1. **Token 限制**: 對話歷史越長,消耗的 token 越多,請注意 API 配額
2. **清除歷史**: 可以使用「Clear History」按鈕清除對話歷史,開始新對話
3. **Space 隔離**: 每個 Space 的對話歷史是獨立的
