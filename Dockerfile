# CogitoAgent Docker Image
# https://github.com/cnt-code/cogito-agent

FROM node:18-alpine

# 安装 Python（用于 Python 代码执行）
RUN apk add --no-cache python3 py3-pip wget

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci --production

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 9527

# 环境变量
ENV NODE_ENV=production
ENV THINKING_INTERVAL=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9527/health || exit 1

# 启动命令
CMD ["npm", "start"]
