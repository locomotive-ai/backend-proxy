/**
 * 健康检查端点
 * 提供服务状态信息，可用于监控系统确认服务是否正常运行
 */

module.exports = function(req, res) {
  // 设置CORS头，允许跨域请求
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理OPTIONS请求（预检请求）
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // 处理GET请求
  if (req.method === 'GET') {
    try {
      // 构建响应数据
      const healthData = {
        status: 'ok',
        service: 'deepseek-api-proxy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime() + 's'
      };
      
      // 发送成功响应
      return res.status(200).json(healthData);
    } catch (error) {
      // 处理内部错误
      console.error('健康检查端点错误:', error);
      return res.status(500).json({
        status: 'error',
        message: '健康检查处理过程中发生内部错误',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // 处理不支持的方法
  return res.status(405).json({
    status: 'error',
    message: '方法不被支持，仅支持GET和OPTIONS请求',
    timestamp: new Date().toISOString()
  });
}; 