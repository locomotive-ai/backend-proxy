# DeepSeek API 代理服务

这是一个简单的代理服务，用于保护 DeepSeek API 密钥不被前端泄露。

## 功能

- 将请求转发到DeepSeek API
- 在服务器端安全存储API密钥
- 支持速率限制防止滥用
- 处理CORS跨域请求

## 本地开发

1. 克隆仓库
```bash
git clone https://github.com/your-username/deepseek-api-proxy.git
cd deepseek-api-proxy
```

2. 安装依赖
```bash
npm install
```

3. 创建`.env`文件并配置API密钥
```bash
cp .env.example .env
# 编辑.env文件，填入你的DeepSeek API密钥
```

4. 启动开发服务器
```bash
npm run dev
```

## 部署到Render

### 手动部署

1. 在[Render](https://render.com)上注册账号并登录

2. 点击"New +"按钮，选择"Web Service"

3. 连接到你的GitHub仓库或直接上传代码

4. 填写以下信息：
   - Name: `deepseek-api-proxy`（或你喜欢的名称）
   - Build Command: `npm install`
   - Start Command: `node server.js`

5. 添加环境变量：
   - `DEEPSEEK_API_KEY`: 你的DeepSeek API密钥
   - `NODE_ENV`: `production`

6. 点击"Create Web Service"按钮

### 使用配置文件部署

如果你使用Render CLI或Blueprint功能，可以直接使用项目中的`render.yaml`文件进行部署。

```bash
# 使用Render CLI
render blueprint apply
```

## 使用方法

### 健康检查

```
GET /api/health
```

### 代理请求

```
POST /api/proxy
Content-Type: application/json

{
  "prompt": "写一篇关于人工智能的文章",
  "user_id": "可选的用户标识符"
}
```

### 响应格式

```json
{
  "content": "DeepSeek API生成的回复内容",
  "status": "success"
}
```

如果发生错误，将返回以下格式:

```json
{
  "error": "错误描述",
  "status": "error"
}
```

## 在前端使用

在前端应用中可以这样调用代理服务：

```javascript
async function generateReply(prompt) {
  try {
    const response = await fetch('https://your-render-app.onrender.com/api/proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        user_id: 'your-user-id' // 可选
      })
    });
    
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    return data.content;
  } catch (error) {
    console.error('API调用失败:', error);
    throw error;
  }
}
```

## 注意事项

- 确保保护你的API密钥安全，不要将其提交到公开仓库
- 根据你的使用情况调整速率限制设置
- 使用HTTPS确保请求安全
- Render免费计划有一定的使用限制，如果需要处理大量请求，建议升级到付费计划 