/**
 * 平台检测工具
 * 通过域名检测当前访问的平台类型
 */

// 平台匹配规则
const PLATFORM_RULES = {
  email: [
    'mail.google.com',
    'outlook.com',
    'mail.yahoo.com',
    'mail',
    'email',
    'inbox',
    'webmail'
  ],
  twitter: [
    'twitter.com',
    'x.com'
  ],
  tiktok: [
    'tiktok.com',
    'tiktok',
    'douyin.com', // 抖音
    'bytedance',
    'musical.ly' // TikTok旧域名
  ],
  instagram: [
    'instagram.com',
    'instagram'
  ],
  facebook: [
    'facebook.com',
    'fb.com',
    'messenger.com'
  ],
  linkedin: [
    'linkedin.com'
  ],
  reddit: [
    'reddit.com'
  ]
};

/**
 * 安全地提取URL的主机名
 * @param {string} url 完整URL
 * @returns {string} 主机名，失败时返回空字符串
 */
function extractHostname(url) {
  try {
    // 使用URL构造函数安全地解析URL
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch (e) {
    console.error('无法解析URL:', url, e);
    return '';
  }
}

/**
 * 识别当前平台
 * @param {string} url 要检测的URL
 * @returns {string} 平台类型，如果无法识别则返回'other'
 */
export function detectPlatform(url) {
  if (!url) return 'other';
  
  const host = extractHostname(url);
  console.log('检测平台 - URL:', url, '主机名:', host);
  
  if (!host) return 'other';
  
  // TikTok特殊检测 - 通过URL路径
  if (url.includes('tiktok.com/') || url.includes('douyin.com/')) {
    console.log('检测到TikTok/抖音平台');
    return 'tiktok';
  }
  
  // 遍历平台规则
  for (const [platform, domains] of Object.entries(PLATFORM_RULES)) {
    for (const domain of domains) {
      if (host.includes(domain)) {
        console.log('匹配到平台:', platform, '通过域名:', domain);
        return platform;
      }
    }
  }
  
  // 通过页面内特定元素进行二次检测
  if (typeof document !== 'undefined') {
    // TikTok特征检测
    if (
      document.querySelector('div[class*="tiktok"]') || 
      document.querySelector('div[data-e2e*="tiktok"]') ||
      document.title.toLowerCase().includes('tiktok')
    ) {
      console.log('通过DOM元素检测到TikTok平台');
      return 'tiktok';
    }
  }
  
  return 'other';
}

/**
 * 扩展平台分析
 * @returns {Object} 包含平台类型及附加信息
 */
export function analyzePlatform() {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const title = typeof document !== 'undefined' ? document.title : '';
  
  const platform = detectPlatform(url);
  console.log('平台分析结果:', platform, '页面标题:', title);
  
  return {
    type: platform,
    url,
    title,
    timestamp: new Date().toISOString()
  };
}

/**
 * 获取适合当前平台的提示内容
 * @param {string} platform 平台类型
 * @returns {string} 平台相关的提示
 */
export function getPlatformPrompt(platform) {
  switch (platform) {
    case 'email':
      return '邮件回复';
    case 'twitter':
      return '推特回复';
    case 'tiktok':
      return 'TikTok评论';
    case 'instagram':
      return 'Instagram评论';
    case 'facebook':
      return 'Facebook回复';
    case 'linkedin':
      return 'LinkedIn专业回复';
    case 'reddit':
      return 'Reddit帖子回复';
    default:
      return '通用回复';
  }
}

export default {
  detectPlatform,
  analyzePlatform,
  getPlatformPrompt
}; 