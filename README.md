# 智能回复生成器 Chrome 扩展

通过DeepSeek API实现智能回复生成，支持多平台自动适配。本扩展严格遵循Chrome扩展的内容安全策略(CSP)，不使用不安全的代码评估方法如`eval`或`unsafe-eval`。

## 项目概述

智能回复生成器是一个Chrome浏览器扩展，通过DeepSeek API实现智能回复生成，支持：

- ✨ **全平台适配**：自动识别Twitter/TikTok/Email等场景
- 🛠️ **双模式生成**：
  - 自动模式：基于关键词+域名检测生成回复
  - 手动模式：自定义平台/语气/场景
- 📋 **零配置使用**：右键选中文本即可调用

## 功能特性

- 支持自动检测并适配多个平台（如邮件、社交媒体等）
- 根据选中文本智能生成回复内容和思路
- 提供多种语气风格选择（闺蜜风、商务风、搞笑风等）
- 支持多种场景（夸夸、不满、咨询等）
- 一键复制生成的回复内容
- 完全遵循Chrome CSP安全策略，无unsafe-eval

## 安装方法

1. 克隆代码库到本地
2. 运行 `npm install` 安装依赖
3. 运行 `npm run build` 构建项目
4. 在Chrome扩展管理页面，开启"开发者模式"
5. 点击"加载已解压的扩展程序"，选择`dist`目录

## 使用方法

1. 在网页上选择文本
2. 右键点击选中的文本，在菜单中选择"智能回复生成"
3. 在弹出的面板中选择平台、场景和语气
4. 点击生成按钮，获取回复内容
5. 复制回复内容到原页面

## 安全说明

本扩展采用以下安全措施：
- 使用沙盒iframe隔离执行环境
- 通过postMessage进行跨帧通信
- 使用预定义的函数替代动态代码执行
- 完全符合Chrome Manifest V3的CSP要求

## 更新日志

### 2024-05-22
- 移除悬浮图标功能，简化扩展架构
- 删除不需要的文件：content_fix.js, icon_frame.html, icon_frame.js, temp_fix.js
- 清理代码库，移除冗余代码，优化性能
- 简化交互方式，专注于右键菜单功能

### 2024-05-21
- 彻底修复双重图标问题：现在选择文本后只显示一个图标，无论是拖动状态还是松开鼠标后
- 调整了内容脚本的加载顺序，确保content_fix.js先于contentScript.js加载
- 禁用了contentScript.js中的重复文本选择监听，改为仅监听content_fix.js发出的事件
- 更新了组件间通信机制，提高了稳定性

### 2024-05-20
- 修复图标显示问题：现在选择文本后只显示一个统一的图标
- 使用扩展自带的icon48.png替代之前的内联SVG图标
- 改进图标点击交互，确保图标点击后正确显示回复面板
- 增强content_fix.js和contentScript.js的事件通信机制

## 核心文件说明

| 文件/目录 | 说明 |
|---------|------|
| **src/manifest.json** | 扩展配置文件，定义权限、内容脚本、图标等 |
| **src/background.js** | 后台脚本，处理右键菜单和跨域通信 |
| **src/contentScript.js** | 内容脚本，注入到网页中处理用户交互和UI显示 |
| **src/sandbox.html** | 沙盒环境，用于安全执行代码 |
| **src/popup/** | 弹出窗口相关文件，包含popup.html、popup.js和popup.css |
| **src/assets/** | 静态资源文件，如图标和样式 |
| **src/resources/** | 资源文件，如配置和模板 |
| **src/services/** | 服务层，包含API调用相关代码 |
| **src/utils/** | 工具函数，如平台检测和场景分析 |

## 文件关系与数据流

1. **用户交互**：
   - 用户在网页上选择文本
   - 右键点击调出上下文菜单，选择"智能回复生成"

2. **后台处理**：
   - background.js接收菜单点击事件
   - 向内容脚本发送消息，传递选中的文本

3. **内容展示**：
   - contentScript.js接收消息并显示回复面板
   - 调用services/api.js向DeepSeek API发送请求
   - 根据返回结果生成回复内容

4. **安全执行**：
   - 需要动态执行的代码在sandbox.html中运行
   - 通过postMessage机制安全通信

## 技术栈

- **核心**：JavaScript, Chrome Extension API
- **UI**：React, Mantine UI
- **NLP**：compromise.js
- **API**：DeepSeek AI
- **构建**：Webpack, Babel

## 贡献指南

欢迎贡献代码或提出建议！请遵循以下步骤：

1. Fork仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request

## 许可证

MIT

## 安全处理API密钥

为确保插件上架Chrome应用商店后API密钥不被泄露，本项目采用后端代理服务的方式处理API请求。

### 安全策略

1. **前端不再存储或传输API密钥**：修改后的代码不再在前端存储DeepSeek API密钥，也不从环境变量中读取
2. **用户标识符**：使用UUID为每个用户生成唯一标识符，用于后端服务识别用户和限流
3. **后端代理服务**：所有对DeepSeek API的请求通过自建的后端服务代理转发

### 后端服务实现示例

下面是一个使用Node.js和Express实现的后端代理服务示例:

```javascript
// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// 从环境变量获取API密钥
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('错误：未设置DEEPSEEK_API_KEY环境变量');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors({
  origin: '*', // 在生产环境中应该限制为特定域名
}));

// 基本的速率限制 - 可以根据用户ID或订阅级别进行更复杂的限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 20, // 每个IP最多20个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '已达到使用限制，请稍后再试' }
});

// 应用API限流中间件
app.use('/api/proxy/deepseek', apiLimiter);

// DeepSeek API代理端点
app.post('/api/proxy/deepseek', async (req, res) => {
  try {
    const { prompt, user_id } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 记录请求（可选）
    console.log(`收到来自用户 ${user_id || 'unknown'} 的请求`);
    
    // 调用DeepSeek API
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
      stream: false,
      top_p: 0.9,
      presence_penalty: 0.2
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      }
    });
    
    // 返回给客户端
    return res.json({
      content: response.data.choices[0].message.content,
      status: 'success'
    });
    
  } catch (error) {
    console.error('代理请求失败:', error.message);
    
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || '服务器内部错误';
    
    return res.status(status).json({
      error: errorMessage,
      status: 'error'
    });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
```

### 部署后端服务

可以使用以下平台部署后端服务:

1. **Vercel**: 适合轻量级API代理，有免费计划
2. **Render**: 提供免费和付费方案
3. **Railway**: 简单易用的部署平台
4. **AWS Lambda**: 无服务器功能，按使用付费
5. **Google Cloud Run**: 无服务器容器，按使用付费

### 设置步骤

1. 创建`.env`文件，添加你的DeepSeek API密钥:
   ```
   DEEPSEEK_API_KEY=你的密钥
   ```

2. 安装依赖:
   ```bash
   npm install express axios cors express-rate-limit dotenv
   ```

3. 启动服务器:
   ```bash
   node server.js
   ```

4. 在插件代码中更新`PROXY_URL`指向你的后端服务地址

### 安全注意事项

1. 确保`.env`文件已添加到`.gitignore`中
2. 在生产环境中，限制CORS为特定域名
3. 考虑添加简单的API密钥或身份验证机制到后端服务
4. 定期轮换DeepSeek API密钥
5. 考虑对不同用户设置不同的使用限制