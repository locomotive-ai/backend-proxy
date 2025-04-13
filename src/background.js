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
      // 首先尝试向内容脚本发送消息
      safelySendMessageToTab(tab.id, {
        action: "generateReply",
        selectedText: selectedText
      }).then(result => {
        // 如果消息发送失败（内容脚本未注入），则动态注入脚本
        if (!result.success) {
          console.log('在非预设网站上使用功能，动态注入内容脚本');
          
          // 使用scripting API动态注入内容脚本
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['contentScript.js']
          }).then(() => {
            // 脚本注入后，等待短暂时间让脚本初始化
            setTimeout(() => {
              // 再次尝试发送消息
              chrome.tabs.sendMessage(tab.id, {
                action: "generateReply",
                selectedText: selectedText,
                from: 'background'
              }).catch(err => console.warn('二次发送消息失败:', err));
            }, 200);
          }).catch(err => {
            console.error('注入内容脚本失败:', err);
            
            // 如果注入失败，使用更简单的脚本直接在页面上显示通知
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              function: function(text) {
                // 创建一个简单的通知元素
                const notification = document.createElement('div');
                notification.textContent = 'AutoReplyGen: 请刷新页面后再试';
                notification.style.cssText = `
                  position: fixed;
                  top: 20px;
                  left: 50%;
                  transform: translateX(-50%);
                  background: #4a3cdb;
                  color: white;
                  padding: 10px 20px;
                  border-radius: 4px;
                  z-index: 10000;
                  font-family: sans-serif;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                `;
                document.body.appendChild(notification);
                
                // 3秒后自动移除通知
                setTimeout(() => notification.remove(), 3000);
              },
              args: [selectedText]
            }).catch(e => console.error('显示通知失败:', e));
          });
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
  } else if (message.action === 'textSelected' && sender.tab) {
    // 处理文本选择消息
    console.log('收到文本选择消息，尝试注入完整内容脚本');
    // 尝试注入完整的内容脚本并显示悬浮图标
    injectContentScript(sender.tab.id, message.text);
  }
  
  // 返回true表示将异步发送响应
  return true;
});

// 监听安装/更新事件
chrome.runtime.onInstalled.addListener(() => {
  // 只在安装或更新时执行一次初始化
  initialize();
  
  // 设置全局选择文本事件监听
  setupGlobalSelectionListener();
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// 设置全局选择文本事件监听器
function setupGlobalSelectionListener() {
  // 监听标签页更新，用于检测文本选择
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 只在页面完成加载时执行
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
      // 检查该网站是否在预设列表中
      const isPresetSite = isPresetWebsite(tab.url);
      
      // 如果不是预设网站，则注入选择文本监听器
      if (!isPresetSite) {
        try {
          // 注入一个轻量级的选择文本监听器，而不是完整的内容脚本
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: setupTextSelectionListenerInPage,
          }).catch(err => console.debug('注入选择监听器失败 (可能已存在):', err));
        } catch (e) {
          console.debug('无法注入选择监听器:', e);
        }
      }
    }
  });
  
  // 注意：消息监听已移至全局消息监听器中，避免重复注册
}

// 在页面上设置文本选择监听器的函数
function setupTextSelectionListenerInPage() {
  // 防止重复添加
  if (window._textSelectionListenerAdded) return;
  window._textSelectionListenerAdded = true;
  
  // 使用防抖函数限制事件触发频率
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  // 处理文本选择事件
  const handleTextSelection = debounce(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 10) {
      // 向扩展发送消息
      chrome.runtime.sendMessage({
        action: 'textSelected',
        text: selection.toString().trim()
      }).catch(err => console.debug('发送选择消息失败:', err));
    }
  }, 300);
  
  // 添加多种事件监听，确保能捕获各种文本选择方式
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('keyup', (e) => {
    // 当按下Shift+方向键或Ctrl+A等可能导致文本选择的组合键时
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      handleTextSelection();
    }
  });
  
  console.debug('AutoReplyGen: 文本选择监听器已添加');
}

// 注入完整内容脚本的函数
function injectContentScript(tabId, selectedText) {
  // 检查标签页是否存在
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.warn('标签页不存在:', chrome.runtime.lastError.message);
      return;
    }
    
    // 首先尝试发送消息，检查内容脚本是否已注入
    chrome.tabs.sendMessage(tabId, { action: 'checkContentScriptLoaded' }, response => {
      // 如果收到响应，说明内容脚本已加载
      if (!chrome.runtime.lastError && response && response.loaded) {
        console.debug('内容脚本已加载，直接发送显示图标请求');
        chrome.tabs.sendMessage(tabId, { 
          action: 'showFloatingIcon',
          selectedText: selectedText
        }).catch(err => console.debug('发送显示图标请求失败:', err));
      } else {
        // 否则注入完整内容脚本
        console.debug('内容脚本未加载，开始注入...');
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['contentScript.js']
        }).then(() => {
          // 等待内容脚本初始化
          setTimeout(() => {
            // 发送消息显示悬浮图标
            chrome.tabs.sendMessage(tabId, { 
              action: 'showFloatingIcon',
              selectedText: selectedText
            }).catch(err => console.debug('内容脚本注入后，发送显示图标请求失败:', err));
          }, 300);
        }).catch(err => {
          console.error('注入内容脚本失败:', err);
        });
      }
    });
  });
}

// 检查是否是预设网站
function isPresetWebsite(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('google.com') || 
           hostname.includes('outlook.com') || 
           hostname.includes('yahoo.com') || 
           hostname.includes('instagram.com') || 
           hostname.includes('facebook.com') || 
           hostname.includes('twitter.com') || 
           hostname.includes('tiktok.com');
  } catch (e) {
    console.error('解析URL失败:', e);
    return false;
  }
}

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