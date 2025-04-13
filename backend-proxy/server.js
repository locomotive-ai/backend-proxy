/**
 * DeepSeek API 代理服务器
 * 用于保护API密钥不被前端泄露
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// 从环境变量获取API密钥
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_API_KEY) {
  console.error('错误：未设置DEEPSEEK_API_KEY环境变量');
  process.exit(1);
}

const app = express();
app.use(express.json());

// 配置CORS，允许所有来源的请求
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 处理OPTIONS请求上的CORS头
app.options('*', cors());

// 提供静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 基本的速率限制
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟窗口
  max: 50, // 每个IP最多50个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '已达到使用限制，请稍后再试' }
});

// 应用API限流中间件
app.use('/api/proxy', apiLimiter);

// DeepSeek API代理端点
app.post('/api/proxy', async (req, res) => {
  try {
    const { prompt, user_id } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: '缺少必要参数', status: 'error' });
    }
    
    // 记录请求
    console.log(`收到来自用户 ${user_id || 'unknown'} 的请求，提示词长度：${prompt.length}`);
    
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

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'DeepSeek API代理服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// 捕获所有其他请求并重定向到首页
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 