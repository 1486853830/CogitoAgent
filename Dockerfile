# CogitoAgent Docker Image
# https://github.com/SnowLeopard-io/CogitoAgent

FROM node:24-alpine

# 安装 Python（用于 Python 代码执行）+ native 模块（isolated-vm）编译工具链
RUN apk add --no-cache python3 py3-pip wget g++ make

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（跳过 husky prepare 脚本，生产环境不需要；保留 native 模块安装脚本，
# 使 isolated-vm 完成 node-gyp 编译——否则代码执行沙箱在容器内不可用）
ENV HUSKY=0
RUN npm ci --production --ignore-scripts \
  && npm rebuild isolated-vm

# 复制源代码
COPY . .

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口：9527 = WebSocket，9528 = 健康检查 HTTP
EXPOSE 9527 9528

# 环境变量
ENV NODE_ENV=production
ENV CLI_MODE=true
ENV COGITO_THINKING_INTERVAL=3000
ENV COGITO_WS_HOST=0.0.0.0
ENV COGITO_WS_HEALTH=true
ENV COGITO_WS_HEALTH_PORT=9528
# 运行期用户数据目录指向持久卷：ws token、推测执行模式库等落在这里，
# 否则会写进容器可写层，重启即丢失。
ENV COGITO_USER_DATA_DIR=/app/data

# 注意：绑定 0.0.0.0 后访问控制完全由 ws token 承担。
# 生产部署务必通过 COGITO_WS_TOKEN 注入一个固定强随机 token，
# 否则每次重启 token 都会变化，远程客户端无法稳定接入。
# ENV COGITO_WS_TOKEN=

# 健康检查：探测独立 HTTP 健康端点（WS 端口不提供 HTTP 服务）
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9528/health || exit 1

# 启动命令：容器为无头环境，运行 CLI 模式（Electron 桌面界面在容器中不可用）
# CLI_MODE=true 使 agent 跳过配置向导直接启动 WS 服务
CMD ["npx", "tsx", "src/index.ts"]
