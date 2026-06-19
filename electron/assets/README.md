# 人物视频素材

将人物视频放入此目录，命名为 `zhanshi.mp4`。

如需自定义文件名，修改 `electron/desktop/renderer.js` 中的 `videoStates`：
```js
const videoStates = { default: '../assets/你的文件名.mp4' };
```

## 视频要求
- 格式：MP4（H.264 编码）
- 分辨率：建议 280x560 或等比例
- 时长：建议 3-5 秒循环

## 视频素材来源
- 自己录制
- AI 生成（如 HeyGen、D-ID 等）
- 免费素材网站