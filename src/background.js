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
  }
  
  // 监听来自内容页面的消息
  if (message.action === 'textSelected' && sender.tab) {
    // 我们不需要立即处理，因为轻量级脚本已经显示了图标
    // 只需记录状态以便需要时使用
    console.debug('收到文本选择消息，当前页面已显示图标');
    sendResponse({ received: true });
  }
  
  // 处理图标点击消息
  if (message.action === 'iconClicked' && sender.tab) {
    console.debug('收到图标点击消息，显示回复面板');
    
    // 发送消息到轻量级脚本显示回复面板
    chrome.tabs.sendMessage(sender.tab.id, {
      action: 'showReplyPanel',
      text: message.text
    }).catch(err => {
      console.warn('发送显示回复面板消息失败:', err);
      // 如果直接发送失败，尝试完整注入
      injectContentScript(sender.tab.id, message.text);
    });
    
    sendResponse({ received: true });
  }
  
  // 处理请求完整功能消息
  if (message.action === 'requestFullFeature' && sender.tab) {
    console.debug('收到请求完整功能消息，注入内容脚本');
    // 注入完整内容脚本
    injectContentScript(sender.tab.id, message.text);
    sendResponse({ received: true });
  }
  
  // 继续处理其他消息...
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
  
  // 监听来自内容页面的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 处理文本选择消息
    if (message.action === 'textSelected' && sender.tab) {
      // 尝试注入完整的内容脚本并显示悬浮图标
      injectContentScript(sender.tab.id, message.text);
      // 立即响应以避免连接关闭错误
      sendResponse({ received: true });
    }
    // 继续处理其他消息...
  });
}

// 在页面上设置文本选择监听器的函数
function setupTextSelectionListenerInPage() {
  // 防止重复添加
  if (window._textSelectionListenerAdded) return;
  window._textSelectionListenerAdded = true;
  
  // 创建悬浮图标
  function createFloatingIcon(rect) {
    // 如果已有图标，先移除
    let existingIcon = document.getElementById('auto-reply-icon');
    if (existingIcon) {
      existingIcon.remove();
    }
    
    // 创建新图标
    const icon = document.createElement('div');
    icon.id = 'auto-reply-icon';
    icon.style.cssText = `
      position: absolute;
      top: ${rect.bottom + window.scrollY + 10}px;
      left: ${(rect.left + rect.right) / 2 + window.scrollX}px;
      transform: translateX(-50%);
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background-color: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 2147483647;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.95;
      transition: transform 0.2s, opacity 0.2s;
    `;
    
    // 添加图标内容 - 使用SVG以避免加载外部资源
    icon.innerHTML = `
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#4a3cdb"/>
        <path d="M8 9H16M8 13H13" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
    
    // 添加动画
    icon.style.animation = 'fadeIn 0.2s ease-out';
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.8) translateX(-50%); }
        to { opacity: 0.95; transform: scale(1) translateX(-50%); }
      }
      #auto-reply-icon:hover {
        transform: scale(1.1) translateX(-50%) !important;
        opacity: 1 !important;
      }
    `;
    
    // 添加点击事件
    icon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // 发送消息到扩展
      chrome.runtime.sendMessage({
        action: 'iconClicked',
        text: window.getSelection().toString().trim()
      }).catch(err => console.debug('发送图标点击消息失败:', err));
      
      // 移除图标
      this.remove();
      if (styleElement.parentNode) {
        styleElement.remove();
      }
    });
    
    // 添加到页面
    document.head.appendChild(styleElement);
    document.body.appendChild(icon);
    
    // 点击页面其他地方时隐藏图标
    const hideOnClickOutside = function(e) {
      if (icon && !icon.contains(e.target)) {
        icon.remove();
        if (styleElement.parentNode) {
          styleElement.remove();
        }
        document.removeEventListener('click', hideOnClickOutside);
      }
    };
    
    // 延迟一下再添加事件监听，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', hideOnClickOutside);
    }, 100);
    
    return icon;
  }
  
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
    const selectedText = selection ? selection.toString().trim() : '';
    
    if (selectedText.length > 10) {
      // 获取选择范围
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 显示悬浮图标
        const icon = createFloatingIcon(rect);
        
        // 同时向扩展发送消息，用于跟踪状态
        chrome.runtime.sendMessage({
          action: 'textSelected',
          text: selectedText
        }).catch(err => console.debug('发送选择消息失败 (这通常是正常的):', err));
      }
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
  
  // 处理消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 如果收到要求显示回复面板的消息
    if (message.action === 'showReplyPanel' && message.text) {
      const text = message.text;
      // 让扩展知道我们收到了消息
      sendResponse({ received: true });
      
      // 保存选中文本
      window._selectedTextForAutoreply = text;
      
      // 创建回复面板
      createReplyPanel(text);
    } else {
      // 默认响应
      sendResponse({ received: true });
    }
    return true; // 异步响应
  });
  
  // 简单回复面板创建
  function createReplyPanel(text) {
    // 创建回复面板元素
    const panel = document.createElement('div');
    panel.id = 'auto-reply-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-width: 800px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    
    // 面板内容
    panel.innerHTML = `
      <div style="padding: 16px 20px; background: linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%); color: white; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0; font-size: 18px;">AutoReplyGen</h2>
        <button id="auto-reply-close" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0;">&times;</button>
      </div>
      <div style="padding: 20px; overflow-y: auto; flex-grow: 1;">
        <p>正在生成回复，请稍候...</p>
        <div style="margin-top: 16px;">
          <button id="auto-reply-generate" style="background: #4a3cdb; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">生成回复</button>
        </div>
      </div>
    `;
    
    // 添加到页面
    document.body.appendChild(panel);
    
    // 添加关闭按钮事件
    document.getElementById('auto-reply-close').addEventListener('click', () => {
      panel.remove();
    });
    
    // 添加生成按钮事件
    document.getElementById('auto-reply-generate').addEventListener('click', () => {
      // 发送消息到扩展请求完整功能
      chrome.runtime.sendMessage({
        action: 'requestFullFeature',
        text: text
      }).catch(err => console.debug('请求完整功能失败:', err));
    });
    
    // 点击外部区域关闭
    document.addEventListener('click', (e) => {
      if (panel && !panel.contains(e.target) && e.target.id !== 'auto-reply-icon') {
        panel.remove();
      }
    });
  }
  
  console.debug('AutoReplyGen: 文本选择监听器和悬浮图标功能已添加');
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