/**
 * 智能回复生成器 - 后台脚本
 * 处理扩展功能的后台逻辑
 */

import { detectPlatform } from './utils/platformDetector';

// 全局变量，用于跟踪菜单是否已创建
let menuCreated = false;

// 创建右键菜单（防止重复创建）
function createContextMenu() {
  // 如果菜单已经创建，直接返回
  if (menuCreated) {
    return;
  }

  try {
    chrome.contextMenus.create({
      id: "smart-reply",
      title: "AutoReplyGen",
      contexts: ["selection"]
    }, () => {
      // 检查是否有错误
      if (chrome.runtime.lastError) {
        console.error("创建菜单时出错:", chrome.runtime.lastError.message);
      } else {
        menuCreated = true;
        console.log("成功创建菜单");
      }
    });
  } catch (error) {
    console.error("创建菜单异常:", error);
  }
}

// 初始化扩展
function initialize() {
  console.log("智能回复生成器后台脚本已启动");
  
  // 先清除所有现有菜单，然后创建新菜单
  try {
    chrome.contextMenus.removeAll(() => {
      menuCreated = false; // 重置菜单状态
      createContextMenu();
    });
  } catch (error) {
    console.error("清除菜单时出错:", error);
    // 如果清除失败，仍尝试创建菜单
    createContextMenu();
  }
}

// 安全地发送消息到内容脚本
function safelySendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    // 使用activeTab权限，直接发送消息到标签页
    try {
      chrome.tabs.sendMessage(tabId, { ...message, from: 'background' }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`向Tab ${tabId} 发送消息失败:`, chrome.runtime.lastError.message);
          // 不要reject，因为这可能是正常的
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ success: true, response });
        }
      });
    } catch (error) {
      console.error('发送消息时出错:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

// 处理右键菜单点击
function handleContextMenuClick(info, tab) {
  if (info.menuItemId === "smart-reply") {
    console.log("用户选择了生成智能回复");
    
    // 获取选中文本
    const selectedText = info.selectionText;
    
    if (selectedText && selectedText.trim().length > 0 && tab && tab.id) {
      // 使用安全的消息发送方法
      safelySendMessageToTab(tab.id, {
        action: "generateReply",
        selectedText: selectedText
      }).then(result => {
        if (!result.success) {
          console.log('无法发送消息到内容脚本，可能内容脚本未加载或已卸载');
          
          // 尝试注入内容脚本作为备选方案
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: function(text) {
              // 通知用户
              alert('智能回复功能已激活，请重新选择文本。');
              // 在页面中保存选中文本
              window.lastSelectedText = text;
            },
            args: [selectedText]
          }).catch(err => console.error('执行脚本失败:', err));
        }
      }).catch(error => {
        console.error('处理右键菜单点击时出错:', error);
      });
    }
  }
}

// 安全地获取平台信息
function getSafePlatformInfo(url) {
  // 使用导入的函数安全地检测平台
  const type = detectPlatform(url);
  return {
    type,
    url
  };
}

// 处理来自内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('后台脚本收到消息:', message);
  
  // 立即发送响应，防止连接关闭错误
  try {
    sendResponse({ received: true });
  } catch (error) {
    console.error('发送响应时出错:', error);
  }
  
  // 处理不同类型的消息
  if (message.action === 'getPlatformInfo') {
    // 获取平台信息
    handleGetPlatformInfo(sender.tab)
      .then(platformInfo => {
        if (sender.tab && sender.tab.id) {
          // 使用安全的消息发送方法
          safelySendMessageToTab(sender.tab.id, {
            action: 'platformInfoResult',
            platformInfo: platformInfo
          }).catch(err => console.warn('发送平台信息时出错 (可能是正常的):', err));
        }
      })
      .catch(error => {
        console.error('获取平台信息失败:', error);
      });
  } else if (message.action === 'checkConnection') {
    // 用于测试连接是否正常
    console.log('收到连接检查请求');
    if (sender.tab && sender.tab.id) {
      safelySendMessageToTab(sender.tab.id, { 
        action: 'connectionStatus', 
        status: 'connected' 
      });
    }
  }
  
  // 返回true表示将异步发送响应
  return true;
});

// 监听安装/更新事件
chrome.runtime.onInstalled.addListener(() => {
  // 只在安装或更新时执行一次初始化
  initialize();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// 处理获取平台信息的请求
async function handleGetPlatformInfo(tab) {
  if (!tab || !tab.url) {
    return { type: 'unknown', url: '' };
  }
  
  // 返回简单的平台信息
  return {
    type: determinePlatformType(tab.url),
    url: tab.url,
    title: tab.title || ''
  };
}

// 简单的平台类型判断函数
function determinePlatformType(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // 匹配常见平台
    if (hostname.includes('mail.google.com') || hostname.includes('outlook.com')) {
      return 'email';
    } else if (hostname.includes('tiktok.com') || hostname.includes('douyin.com')) {
      return 'tiktok';
    } else if (hostname.includes('instagram.com')) {
      return 'instagram';
    } else if (hostname.includes('facebook.com') || hostname.includes('fb.com')) {
      return 'facebook';
    } else {
      return 'other';
    }
  } catch (e) {
    console.error('URL解析失败:', e);
    return 'other';
  }
}