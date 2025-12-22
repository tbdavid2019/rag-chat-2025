# 使用 Node.js 20 LTS Alpine 作為基底映像（穩定且輕量）
FROM node:20-alpine AS builder

# 設定工作目錄
WORKDIR /app

# 複製 package files
COPY package*.json ./

# 安裝所有依賴（包含 devDependencies 用於構建）
RUN npm ci && npm cache clean --force

# 復製所有源碼
COPY . .

# 構建前端生產文件
RUN npm run build

# ===== 最終映像 =====
FROM node:20-alpine

# 安裝 dumb-init（用於正確處理信號）
RUN apk add --no-cache dumb-init

# 創建非 root 用戶
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# 設定工作目錄
WORKDIR /app

# 從 builder 複製 node_modules 和應用程式碼
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs . .

# 創建 data 目錄並設定權限
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app/data

# 切換到非 root 用戶
USER nodejs

# 暴露端口（只需要 3000）
EXPOSE 3005

# 設定環境變數
ENV NODE_ENV=production

# 使用 dumb-init 啟動生產模式（Express 提供前端靜態文件）
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
