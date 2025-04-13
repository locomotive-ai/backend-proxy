/**
 * 智能回复生成器 - 内容脚本
 * 负责与页面交互，提取信息，展示结果
 * 
 * 安全注意事项:
 * - 避免使用eval和不安全的动态代码执行
 * - 使用安全的DOM操作方法
 * - 通过iframe和Shadow DOM隔离内容
 * - 使用沙盒iframe执行动态代码
 */

import { detectPlatform, analyzePlatform } from './utils/platformDetector';
import { detectScenario } from './utils/scenarioDetector';
import { generateReply } from './services/api';

// 添加调试日志
console.log('智能回复生成器内容脚本已加载', window.location.href);

// 添加全局初始化标记，用于测试脚本检测
window.smartReplyExtensionInitialized = true;

// 将showReplyPanel暴露给全局，以便content_fix.js调用
window.showReplyPanel = showReplyPanel;

// 存储当前页面信息
let currentPlatform = 'other';
let selectedText = '';
let selectionRect = null;
let iconAdded = false; // 跟踪图标是否已添加到页面
let sandboxFrame = null; // 沙盒iframe引用
let currentTextHash = null; // 存储当前文本的哈希，用于跟踪选择变化
let userModifiedContent = {}; // 存储用户手动修改的内容

// 添加全局标记，表示扩展上下文是否有效
let extensionContextValid = true;

// 改进检查扩展上下文函数，使它更健壮
function isExtensionContextValid() {
  try {
    // 首先检查全局标记
    if (extensionContextValid === false) {
      // 尝试通过指纹识别判断是否是暂时性失效
      const recoveryFingerprintMatch = 
        typeof chrome !== 'undefined' && 
        typeof chrome.extension !== 'undefined' &&
        typeof chrome.extension.getURL === 'function';
      
      if (recoveryFingerprintMatch) {
        console.log('检测到潜在的恢复机会，尝试重置上下文状态');
        extensionContextValid = null; // 重置为未知状态
      } else {
        return false;
      }
    }
    
    // 检查chrome API是否存在
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      extensionContextValid = false;
      return false;
    }
    
    // 尝试访问扩展ID，如果上下文无效会抛出错误
    try {
      const id = chrome.runtime.id;
      if (!id) {
        extensionContextValid = false;
        return false;
      }
    } catch (idError) {
      console.warn('访问扩展ID时出错:', idError);
      extensionContextValid = false;
      return false;
    }
    
    // 检查getURL方法是否可用
    if (typeof chrome.runtime.getURL !== 'function') {
      extensionContextValid = false;
      return false;
    }
    
    // 尝试获取URL进行最终验证
    try {
      const testUrl = chrome.runtime.getURL('sandbox.html');
      if (!testUrl || !testUrl.includes('sandbox.html')) {
        extensionContextValid = false;
        return false;
      }
    } catch (urlError) {
      console.warn('获取sandbox.html URL失败:', urlError);
      sandboxFrame.src = 'about:blank'; // 回退方案
    }
    
    // 一切正常
    extensionContextValid = true;
    return true;
  } catch (error) {
    console.warn('扩展上下文检查失败:', error);
    extensionContextValid = false;
    return false;
  }
}

// 更智能的连接检查函数
function checkBackgroundConnection() {
  console.log('检查与后台脚本的连接...');
  
  // 设置重试计数器
  window._connectionRetryCount = window._connectionRetryCount || 0;
  
  try {
    // 检查扩展上下文是否有效
    if (!isExtensionContextValid()) {
      console.warn('扩展上下文无效，跳过连接检查');
      extensionContextValid = false;
      
      // 如果重试次数不超过限制，设置重试
      if (window._connectionRetryCount < 3) {
        window._connectionRetryCount++;
        console.log(`将在5秒后重试连接检查 (${window._connectionRetryCount}/3)`);
        setTimeout(checkBackgroundConnection, 5000);
      }
      return;
    }
    
    // 使用try-catch包装消息发送
    try {
      chrome.runtime.sendMessage({ 
        action: 'checkConnection',
        timestamp: Date.now(),
        url: window.location.href,
        connectionRetry: window._connectionRetryCount
      }, response => {
        // 检查最后一个错误
        if (chrome.runtime.lastError) {
          console.warn('连接检查失败:', chrome.runtime.lastError.message);
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            extensionContextValid = false;
            
            // 尝试恢复机制
            triggerContextRecovery();
          }
        } else {
          console.log('连接状态:', response);
          extensionContextValid = true;
          window._connectionRetryCount = 0; // 重置重试计数
        }
      });
    } catch (msgError) {
      console.error('发送连接检查消息时出错:', msgError);
      // 如果是扩展上下文无效错误，设置标志
      if (msgError.message && msgError.message.includes('Extension context invalidated')) {
        extensionContextValid = false;
        
        // 尝试恢复机制
        triggerContextRecovery();
      }
    }
  } catch (error) {
    console.error('检查连接过程中出错:', error);
    // 如果是扩展上下文无效错误，设置标志
    if (error.message && error.message.includes('Extension context invalidated')) {
      extensionContextValid = false;
      
      // 尝试恢复机制
      triggerContextRecovery();
    }
  }
}

// 恢复机制 - 尝试通过刷新页面元素来恢复
function triggerContextRecovery() {
  console.log('尝试恢复扩展上下文...');
  
  // 在恢复前，设置计数器防止无限循环
  window._recoveryAttempts = window._recoveryAttempts || 0;
  
  if (window._recoveryAttempts >= 2) {
    console.warn('已达到最大恢复尝试次数，停止恢复尝试');
    return;
  }
  
  window._recoveryAttempts++;
  
  // 移除旧的iframe和资源
  hideFloatingIcon();
  
  // 移除沙盒iframe
  const sandbox = document.getElementById('smart-reply-sandbox');
  if (sandbox) sandbox.remove();
  
  // 重新初始化沙盒 - 延迟执行
  setTimeout(() => {
    console.log('尝试重新初始化沙盒环境...');
    initSandbox();
  }, 1000);
  
  // 重新检查连接 - 更长延迟
  setTimeout(checkBackgroundConnection, 3000);
}

// 安全地发送消息到后台脚本
function safelySendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    try {
      // 检查扩展上下文是否有效
      if (chrome.runtime && chrome.runtime.id) {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            console.warn('发送消息到后台脚本失败:', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve({ success: true, response });
          }
        });
      } else {
        console.warn('扩展上下文无效，无法发送消息');
        resolve({ success: false, error: 'Extension context invalidated' });
      }
    } catch (error) {
      console.error('发送消息时出错:', error);
      resolve({ success: false, error: error.message });
    }
  });
}

// 定期检查是否初始化成功
let initAttempts = 0;
function checkInitialization() {
  if (document.readyState !== 'complete') {
    // 如果页面还没加载完成，延迟执行
    console.log('页面尚未加载完成，等待...');
    if (initAttempts < 10) { // 增加尝试次数
      initAttempts++;
      setTimeout(checkInitialization, 1000);
    } else {
      console.log('尝试初始化超过最大次数，尝试强制初始化');
      initialize(); // 尝试强制初始化
    }
    return;
  }
  
  console.log('执行初始化检查...');
  try {
    // 尝试初始化
    initialize();
    // 初始化成功后，主动创建测试按钮并添加额外监听器
    setTimeout(() => {
      createTestButton();
      // 添加额外监听器
      addExtraEventListeners();
    }, 1000);
  } catch (error) {
    console.error('初始化失败，将重试:', error);
    if (initAttempts < 10) { // 增加尝试次数
      initAttempts++;
      setTimeout(checkInitialization, 1000);
    } else {
      console.error('多次尝试初始化均失败，强制添加事件监听器');
      // 强制添加事件监听器
      addExtraEventListeners();
    }
  }
}

// 添加额外的事件监听器，确保在各种情况下都能捕获文本选择
function addExtraEventListeners() {
  try {
    // 添加复合事件监听
    document.addEventListener('mousedown', function(e) {
      console.log('鼠标按下事件，准备可能的选择');
    });
    
    // 尝试全局捕获方式添加事件
    document.addEventListener('mouseup', handleTextSelection, true);
    
    // 监听鼠标双击事件，通常用于选择单词
    document.addEventListener('dblclick', function(e) {
      console.log('鼠标双击事件，可能选择了单词');
      // 给浏览器一点时间完成选择
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          selectedText = selection.toString().trim();
          if (selection.rangeCount > 0) {
            selectionRect = selection.getRangeAt(0).getBoundingClientRect();
            hideFloatingIcon();
            iconAdded = false;
            showFloatingIcon(selectionRect);
          }
        }
      }, 50);
    });
    
    // 监听keyup事件，捕获键盘选择（比如通过Shift+箭头键）
    document.addEventListener('keyup', function(e) {
      // 仅当按下了与选择相关的键时检查
      const selectionKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
      if (e.shiftKey && selectionKeys.includes(e.key)) {
        console.log('键盘选择事件');
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection && selection.toString().trim().length > 0) {
            selectedText = selection.toString().trim();
            if (selection.rangeCount > 0) {
              selectionRect = selection.getRangeAt(0).getBoundingClientRect();
              hideFloatingIcon();
              iconAdded = false;
              showFloatingIcon(selectionRect);
            }
          }
        }, 50);
      }
    });
    
    // 监听contextmenu事件，确保右键菜单显示前已经正确处理了选择
    document.addEventListener('contextmenu', function(e) {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        console.log('右键菜单事件，有文本选择');
        // 不需要做什么，只是确保我们已经注意到了选择
      }
    });
    
    console.log('已添加额外事件监听器，增强文本选择捕获能力');
  } catch (error) {
    console.error('添加额外事件监听器失败:', error);
  }
}

// 在页面可见性改变时重新检查初始化
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('页面可见性改变，重新检查初始化状态');
    // 如果页面变为可见，检查是否需要重新初始化
    if (!window.smartReplyExtensionInitialized) {
      console.log('插件未初始化，尝试重新初始化');
      initAttempts = 0;
      checkInitialization();
    } else {
      console.log('插件已初始化，不需要重新初始化');
    }
  }
});

// 增强的文本选择事件处理函数
function handleTextSelection(event) {
  try {
    console.log('文本选择事件触发:', event.type);
    
    // 确保图标不被禁用
    window._blockFloatingIcon = false;
    
    // 延迟处理，确保选择已完成
    setTimeout(() => {
      // 获取选中文本
      const selection = window.getSelection();
      if (!selection) {
        console.log('无法获取selection对象');
        return;
      }
      
      const selectedString = selection.toString().trim();
      
      // 记录选择情况
      console.log('选择文本长度:', selectedString.length);
      
      // 如果有选中文本
      if (selectedString.length > 0) {
        // 保存选中的文本
        selectedText = selectedString;
        
        try {
          // 检查是否有Range
          if (selection.rangeCount > 0) {
            // 获取选中区域的位置
            const range = selection.getRangeAt(0);
            selectionRect = range.getBoundingClientRect();
            
            // 记录位置信息
            console.log('选区位置:', {
              top: selectionRect.top,
              left: selectionRect.left,
              bottom: selectionRect.bottom,
              right: selectionRect.right
            });
            
            // 显示悬浮图标
            showFloatingIcon(selectionRect);
          } else {
            console.warn('选择没有范围信息');
          }
        } catch (rangeError) {
          console.error('处理选择范围时出错:', rangeError);
        }
      }
    }, 200); // 增加延迟时间以确保选择完成
  }
  catch (error) {
    console.error('文本选择处理失败:', error);
  }
}

// 添加高级事件监听器，确保能够捕获选择事件
function setupTextSelectionListeners() {
  try {
    console.log('设置文本选择事件监听器');
    
    // 添加鼠标释放事件监听器，用于捕获选择文本
    document.addEventListener('mouseup', handleTextSelection, true);
    
    // 监听鼠标双击事件，通常用于选择单词
    document.addEventListener('dblclick', function(e) {
      console.log('鼠标双击事件，可能选择了单词');
      // 给浏览器一点时间完成选择
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) {
          selectedText = selection.toString().trim();
          if (selection.rangeCount > 0) {
            selectionRect = selection.getRangeAt(0).getBoundingClientRect();
            hideFloatingIcon();
            showFloatingIcon(selectionRect);
          }
        }
      }, 50);
    });
    
    // 监听keyup事件，捕获键盘选择（比如通过Shift+箭头键）
    document.addEventListener('keyup', function(e) {
      // 仅当按下了与选择相关的键时检查
      const selectionKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
      if (e.shiftKey && selectionKeys.includes(e.key)) {
        console.log('键盘选择事件');
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection && selection.toString().trim().length > 0) {
            selectedText = selection.toString().trim();
            if (selection.rangeCount > 0) {
              selectionRect = selection.getRangeAt(0).getBoundingClientRect();
              hideFloatingIcon();
              showFloatingIcon(selectionRect);
            }
          }
        }, 50);
      }
    });
    
    // 处理ESC键，用于关闭图标
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        hideFloatingIcon();
      }
    });
    
    console.log('文本选择事件监听器设置完成');
  } catch (error) {
    console.error('设置文本选择事件监听器失败:', error);
  }
}

// 改进的初始化函数，增加容错能力
function initialize() {
  try {
    // 设置初始化状态
    window.smartReplyExtensionInitialized = false;
    
    console.log('开始初始化内容脚本，文档状态:', document.readyState);
    
    // 如果DOM尚未加载完成，等待DOMContentLoaded事件
    if (document.readyState === 'loading') {
      console.log('文档仍在加载中，等待DOMContentLoaded事件');
      document.addEventListener('DOMContentLoaded', function() {
        console.log('DOMContentLoaded事件触发，初始化内容脚本');
        setTimeout(initializeAfterDOMLoaded, 100); // 短暂延迟，确保DOM完全加载
      });
    } else {
      // 否则，直接初始化
      console.log('文档已加载，直接初始化内容脚本');
      initializeAfterDOMLoaded();
    }
    
    // 添加页面可见性变化监听
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && !window.smartReplyExtensionInitialized) {
        console.log('页面可见性变化，重新检查初始化');
        initializeAfterDOMLoaded();
      }
    });
    
    // 返回true表示初始化过程已启动
    return true;
  } catch (error) {
    console.error('初始化内容脚本失败:', error);
    return false;
  }
}

// DOM加载后的初始化逻辑
function initializeAfterDOMLoaded() {
  // 安全检查，确保body元素存在
  if (!document.body) {
    console.error('无法找到body元素，内容脚本初始化失败');
    // 稍后重试
    setTimeout(initializeAfterDOMLoaded, 500);
    return;
  }

  try {
    // 分析当前平台 - 使用当前URL而非依赖window.location
    const currentUrl = document.URL || window.location.href;
    currentPlatform = detectPlatform(currentUrl);
    console.log('智能回复生成器: 当前平台 -', currentPlatform, '页面URL:', currentUrl);
    
    // 设置文本选择监听器
    setupTextSelectionListeners();
    
    // 监听文档点击事件，处理图标之外的点击
    document.addEventListener('click', function(e) {
      // 查找可能存在的图标元素
      const icon = document.getElementById('smart-reply-icon');
      const iframe = document.getElementById('smart-reply-iframe');
      const shadowHost = document.getElementById('smart-reply-host');
      const panel = document.getElementById('smart-reply-panel');
      
      // 检查点击是否发生在我们的UI元素之外
      const clickedOutside = (!icon || !icon.contains(e.target)) && 
                            (!iframe || !iframe.contains(e.target)) &&
                            (!shadowHost || !shadowHost.contains(e.target)) &&
                            (!panel || !panel.contains(e.target));
      
      // 仅当点击在UI元素外部时隐藏图标
      if (clickedOutside) {
        console.log('点击在UI元素外部，隐藏图标');
        hideFloatingIcon();
      } else {
        console.log('点击在UI元素内部，保持显示');
      }
    });
    
    // 初始化沙盒环境
    initSandbox();
    
    // 打印日志确认内容脚本初始化完成
    console.log('智能回复生成器: 内容脚本初始化完成, 已监听文本选择');
    
    // 添加调试信息到页面
    addDebugInfoToPage();
    
    // 设置初始化成功标志
    window.smartReplyExtensionInitialized = true;
    
    // 强制创建测试按钮 - 延迟创建以确保DOM完全加载
    setTimeout(() => {
      try {
        createTestButton();
        console.log('已添加测试按钮，延迟创建');
      } catch (btnError) {
        console.error('创建测试按钮失败:', btnError);
      }
    }, 2000);  // 延长延迟时间到2秒
  } catch (error) {
    console.error('内容脚本初始化失败:', error);
  }
}

// 添加调试信息到页面
function addDebugInfoToPage() {
  // 设置为false以禁用调试信息
  const isDev = false; // 禁用调试信息显示
  
  if (!isDev) return;
  
  try {
    const debugElement = document.createElement('div');
    debugElement.id = 'smart-reply-debug-info';
    debugElement.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 10000;
      max-width: 300px;
      overflow: hidden;
      font-family: monospace;
    `;
    debugElement.textContent = '智能回复生成器已初始化。选择文本测试功能。';
    
    // 添加点击事件，隐藏调试信息
    debugElement.addEventListener('click', function() {
      this.style.display = 'none';
    });
    
    document.body.appendChild(debugElement);
    console.log('添加调试信息到页面');
  } catch (error) {
    console.error('添加调试信息失败:', error);
  }
}

// 初始化沙盒环境 - 增强版
function initSandbox() {
  try {
    // 确保body元素存在
    if (!document.body) {
      console.warn('无法初始化沙盒：body元素不存在');
      return;
    }

    // 移除之前可能存在的沙盒iframe
    const existingSandbox = document.getElementById('smart-reply-sandbox');
    if (existingSandbox) {
      existingSandbox.remove();
    }

    // 创建隐藏的沙盒iframe
    sandboxFrame = document.createElement('iframe');
    sandboxFrame.id = 'smart-reply-sandbox';
    sandboxFrame.style.cssText = `
      position: absolute;
      width: 0;
      height: 0;
      border: 0;
      visibility: hidden;
      display: none;
    `;
    
    // 处理加载完成事件 - 忽略错误
    sandboxFrame.onload = function() {
      // 这里的错误是预期的，DOMException是因为跨域安全限制
      // 我们可以忽略这个错误，因为它不影响主要功能
      console.debug('沙盒iframe加载完成 - 可能会有跨域限制警告，这是正常的');
    };
    
    // 使用安全的方法获取扩展URL
    try {
      // 检查扩展上下文是否有效
      if (isExtensionContextValid()) {
        sandboxFrame.src = chrome.runtime.getURL('sandbox.html');
        console.log('使用扩展URL初始化沙盒');
      } else {
        // 使用空白页面作为回退
        console.warn('扩展上下文无效，使用about:blank作为沙盒');
        sandboxFrame.src = 'about:blank';
      }
    } catch (urlError) {
      console.warn('获取sandbox.html URL失败:', urlError);
      sandboxFrame.src = 'about:blank'; // 回退方案
    }
    
    // 添加到页面 - 使用try-catch防止可能的DOM异常
    try {
      document.body.appendChild(sandboxFrame);
      console.log('沙盒iframe已添加到页面');
    } catch (appendError) {
      console.warn('添加沙盒iframe到DOM时出错:', appendError);
    }
    
    console.log('沙盒iframe初始化过程完成');
  } catch (error) {
    console.error('初始化沙盒环境失败:', error);
    // 错误不会影响主要功能，所以继续执行
  }
}

// 通过沙盒安全执行动态代码（增强版）
function execInSandbox(instruction, params) {
  return new Promise((resolve, reject) => {
    // 如果沙盒不可用或扩展上下文无效，直接使用回退
    if (!extensionContextValid || !sandboxFrame || !sandboxFrame.contentWindow) {
      // 使用本地回退处理常见指令
      return handleFallbackExecution(instruction, params, resolve, reject);
    }
    
    // 尝试使用沙盒，但捕获可能的错误
    try {
      // 生成唯一ID
      const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      
      // 监听消息
      const messageHandler = function(event) {
        try {
          // 验证消息来源
          if (event.source !== sandboxFrame.contentWindow) {
            return;
          }
          
          // 检查消息ID
          if (event.data && event.data.id === messageId) {
            // 移除消息监听
            window.removeEventListener('message', messageHandler);
            
            // 处理结果
            if (event.data.success) {
              resolve(event.data.result);
            } else {
              reject(new Error(event.data.error));
            }
          }
        } catch (msgHandlerError) {
          // 忽略消息处理错误，使用回退
          window.removeEventListener('message', messageHandler);
          handleFallbackExecution(instruction, params, resolve, reject);
        }
      };
      
      // 添加消息监听
      window.addEventListener('message', messageHandler);
      
      // 设置超时
      const timeoutId = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        // 超时时使用回退
        handleFallbackExecution(instruction, params, resolve, reject);
      }, 1000); // 更短的超时时间
      
      // 尝试发送消息
      try {
        sandboxFrame.contentWindow.postMessage({
          action: 'evalScript',
          id: messageId,
          instruction: instruction,
          params: params
        }, '*');
      } catch (postError) {
        // 清除超时和监听器
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);
        
        // 使用回退
        handleFallbackExecution(instruction, params, resolve, reject);
      }
    } catch (error) {
      // 捕获所有其他错误，使用回退
      handleFallbackExecution(instruction, params, resolve, reject);
    }
  });
}

// 处理回退执行
function handleFallbackExecution(instruction, params, resolve, reject) {
  console.warn('使用本地回退处理:', instruction);
  
  try {
    // 处理常见指令
    if (instruction === 'hashText') {
      // 简单的文本哈希函数
      let hash = 0;
      const text = params.text || '';
      for (let i = 0; i < Math.min(text.length, 100); i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      resolve(hash.toString());
    } else if (instruction === 'analyzePlatform') {
      // 简单的平台分析
      resolve({ type: 'other', confidence: 0.5 });
    } else if (instruction === 'detectScenario') {
      // 简单的场景检测
      resolve({ type: 'other', confidence: 0.5 });
    } else {
      // 对于其他指令返回空结果
      resolve('');
    }
  } catch (fallbackError) {
    console.error('回退处理失败:', fallbackError);
    // 返回空结果而不是拒绝承诺，避免级联错误
    resolve('');
  }
}

// 创建测试按钮（用于开发测试）
function createTestButton() {
  // 检查按钮是否已存在，避免重复创建
  if (document.getElementById('smart-reply-test-btn') || 
      document.getElementById('smart-reply-test-iframe')) {
    console.log('测试按钮已存在，不重复创建');
    return;
  }
  
  console.log('创建测试按钮...');
  
  // 使用更安全的iframe方式创建按钮
  const iframe = document.createElement('iframe');
  iframe.id = 'smart-reply-test-iframe';
  iframe.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 2147483647;
    width: 80px;
    height: 40px;
    border: none;
    background: transparent;
  `;
  
  // 直接添加空iframe到文档
  document.body.appendChild(iframe);
  
  // 在iframe加载完成后添加内容
  iframe.onload = function() {
    try {
      // 获取iframe内部文档
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      
      // 添加样式
      const style = document.createElement('style');
      style.textContent = `
        body {
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        button {
          width: 100%;
          height: 100%;
          background: #ff5722;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-family: Arial, sans-serif;
          user-select: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
      `;
      iframeDoc.head.appendChild(style);
      
      // 创建按钮
      const button = iframeDoc.createElement('button');
      button.textContent = '测试回复';
      
      // 添加点击事件
      button.addEventListener('click', function() {
        console.log('iframe中的测试按钮被点击');
        
        // 创建一个模拟的选择区域
        const mockRect = {
          bottom: 200,
          right: 200,
          top: 180,
          left: 100
        };
        
        // 显示悬浮图标
        window.parent.postMessage({
          type: 'SMART_REPLY_TEST_CLICK',
          rect: mockRect
        }, '*');
      });
      
      // 添加按钮到iframe
      iframeDoc.body.appendChild(button);
      console.log('通过iframe添加测试按钮成功');
    } catch (iframeError) {
      console.error('通过iframe添加测试按钮失败:', iframeError);
    }
  };
  
  // 处理iframe加载失败的情况
  iframe.onerror = function() {
    console.error('iframe加载失败');
    iframe.remove();
  };
}

// 扩展消息监听器以处理图标点击事件
window.addEventListener('message', function(event) {
  // 安全检查
  if (!event.data || typeof event.data !== 'object') {
    return;
  }
  
  // 处理测试按钮点击事件
  if (event.data.type === 'SMART_REPLY_TEST_CLICK') {
    console.log('收到测试按钮消息');
    showFloatingIcon(event.data.rect);
  }
  
  // 处理图标点击事件
  else if (event.data.type === 'SMART_REPLY_ICON_CLICK') {
    console.log('收到图标点击消息，显示回复面板');
    // 隐藏图标
    hideFloatingIcon();
    // 显示回复面板
    showReplyPanel();
  }
}, false);

// 隐藏浮动图标 - 增强版
function hideFloatingIcon() {
  try {
    // 移除图标元素
    const icon = document.getElementById('auto-reply-icon');
    if (icon) {
      icon.remove();
    }
    
    // 移除样式
    const style = document.getElementById('auto-reply-style');
    if (style) {
      style.remove();
    }
    
    // 移除所有可能的残留图标元素 - 使用通配符选择器
    const possibleIcons = document.querySelectorAll('[id*="auto-reply-icon"], [id*="smart-reply-icon"]');
    possibleIcons.forEach(element => {
      element.remove();
    });
    
    console.log('图标已彻底移除');
    return true;
  } catch (error) {
    console.error('隐藏图标时出错:', error);
    return false;
  }
}

// 显示浮动图标 - 增强版
function showFloatingIcon(rect) {
  try {
    // 检查是否存在显示面板
    const panel = document.getElementById('smart-reply-panel');
    if (panel) {
      console.log('面板已显示，不显示图标');
      return false;
    }
    
    // 重置图标禁用标志，确保每次选择文本都能显示图标
    window._blockFloatingIcon = false;
    
    // 移除旧的图标
    hideFloatingIcon();
    
    console.log('显示悬浮图标');
    
    // 创建图标元素
    const icon = document.createElement('div');
    icon.id = 'auto-reply-icon';
    
    // 计算位置
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // 图标默认显示在选中文本的右下角
    let top, left;
    
    // 如果选区宽度小于100px，则将图标放在选区下方中间位置
    if (rect.width < 100) {
      // 使用选区的相对位置，加上滚动偏移
      top = rect.bottom + 5;
      left = rect.left + (rect.width / 2) - 30; // 图标宽度60px，居中放置
    } else {
      // 否则放在选区右下角
      top = rect.bottom + 5;
      left = rect.right - 30;
    }
    
    // 防止图标超出视窗
    if (left + 60 > windowWidth) {
      left = windowWidth - 70;
    }
    if (left < 0) {
      left = 5;
    }
    
    // 确保图标在视窗内
    // 如果图标会超出屏幕底部，改为显示在选区上方
    if (top + 60 > windowHeight) {
      top = rect.top - 65; // 放在选区上方
    }
    
    // 如果图标会超出屏幕顶部，改回放在选区下方但确保在视窗内
    if (top < 0) {
      top = Math.min(5, rect.bottom + 5);
    }
    
    // 设置样式 - 使用 fixed 定位，相对于视窗而非文档
    icon.style.cssText = `
      position: fixed !important;
      z-index: 2147483646 !important;
      top: ${top}px !important;
      left: ${left}px !important;
      width: 60px !important;
      height: 60px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      pointer-events: auto !important;
      border: none !important;
      opacity: 0.95 !important;
      transition: transform 0.2s ease, opacity 0.2s ease !important;
      background: transparent !important;
    `;
    
    // 使用我们的图标
    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('assets/icon48.png');
    img.style.cssText = `
      width: 48px !important;
      height: 48px !important;
      object-fit: contain !important;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2)) !important;
    `;
    
    icon.appendChild(img);
    
    // 添加简单的动画效果
    const style = document.createElement('style');
    style.id = 'auto-reply-style';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 0.95; transform: scale(1); }
      }
      #auto-reply-icon {
        animation: fadeIn 0.2s ease-out;
      }
      #auto-reply-icon:hover {
        transform: scale(1.1) !important;
        opacity: 1 !important;
      }
    `;
    
    // 添加点击事件监听器
    icon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('智能回复图标被点击');
      
      // 设置禁用标志
      window._blockFloatingIcon = true;
      
      // 确保图标完全移除
      setTimeout(() => {
        // 隐藏图标 - 使用延时确保DOM操作顺序正确
        hideFloatingIcon();
        
        // 延时后再显示面板，确保图标被移除后再显示面板
        setTimeout(() => {
          // 显示回复面板
          showReplyPanel();
        }, 50);
      }, 0);
      
      return false;
    });
    
    // 将样式和图标添加到页面
    document.head.appendChild(style);
    document.body.appendChild(icon);
    
    return true;
  } catch (error) {
    console.error('显示悬浮图标时出错:', error);
    return false;
  }
}

// 显示回复面板
async function showReplyPanel() {
  try {
    console.log('开始显示回复面板');
    
    // 立即彻底移除图标，无论在哪个阶段
    hideFloatingIcon();
    
    // 禁止显示图标直到面板关闭
    window._blockFloatingIcon = true;
    
    // 检查是否有选中文本
    if (!selectedText || selectedText.trim().length === 0) {
      // 尝试获取当前选中文本
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        selectedText = selection.toString().trim();
      } else {
        console.warn('没有选中文本，无法显示回复面板');
        showNotification('请先选择文本再使用该功能');
        return;
      }
    }
    
    // 检查页面上是否已存在面板
    const existingPanel = document.getElementById('smart-reply-panel');
    if (existingPanel) {
      console.log('回复面板已存在，不重复创建');
      return;
    }
    
    // 先创建加载面板
    const loadingPanel = createLoadingPanel();
    
    try {
      // 生成当前文本的哈希
      currentTextHash = await hashSelectedText();
      
      // 检测场景
      let scenarioResult;
      try {
        scenarioResult = await detectScenario(selectedText);
        console.log('场景检测结果:', scenarioResult);
      } catch (error) {
        console.error('场景检测失败:', error);
        scenarioResult = { type: 'unknown', confidence: 0, textHash: currentTextHash };
      }
      
      // 获取平台信息
      const platformInfo = analyzePlatform();
        
      // 移除加载面板
      if (loadingPanel && loadingPanel.parentNode) {
        loadingPanel.remove();
      }
      
      // 创建回复面板
      const panel = document.createElement('div');
      panel.id = 'smart-reply-panel';
      panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 800px;
        max-width: 90vw;
        max-height: 92vh;
        background-color: white;
        border-radius: 10px;
        box-shadow: 0 6px 30px rgba(0,0,0,0.25);
        z-index: 2147483647;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
        display: flex;
        flex-direction: column;
      `;
      
      // 面板头部
      const header = document.createElement('div');
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 3px 20px;
        background: linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%);
        color: white;
      `;
      
      const title = document.createElement('div');
      title.textContent = 'AutoReplyGen';
      title.style.cssText = `
        font-weight: bold;
        font-size: 18px;
        line-height: 30px;
      `;
      
      const closeButton = document.createElement('button');
      closeButton.innerHTML = '&times;';
      closeButton.style.cssText = `
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: white;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
      `;
      closeButton.addEventListener('click', removeReplyPanel);
      
      header.appendChild(title);
      header.appendChild(closeButton);
      panel.appendChild(header);
      
      // 面板内容
      const content = document.createElement('div');
      content.style.cssText = `
        padding: 20px 24px 24px;
        overflow-y: auto;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 20px;
        font-size: 15px;
      `;
      
      // 1. 文本预览区域
      const textPreviewContainer = document.createElement('div');
      textPreviewContainer.style.cssText = `
        display: flex;
        gap: 24px;
        width: 100%;
        margin-bottom: 4px;
      `;
      
      // 原文区域
      const originalTextContainer = document.createElement('div');
      originalTextContainer.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;
      
      const originalTextLabel = document.createElement('div');
      originalTextLabel.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 30px;
      `;
      
      const originalTitle = document.createElement('label');
      originalTitle.textContent = '原文 (Original Text)';
      originalTitle.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        color: #333;
      `;
      
      originalTextLabel.appendChild(originalTitle);
      
      const originalTextBox = document.createElement('div');
      originalTextBox.style.cssText = `
        padding: 15px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: #f9f9f9;
        font-size: 15px;
        height: 120px;
        overflow-y: auto;
        line-height: 1.5;
        resize: vertical;
      `;
      originalTextBox.textContent = selectedText;
      
      originalTextContainer.appendChild(originalTextLabel);
      originalTextContainer.appendChild(originalTextBox);
      
      // 翻译区域
      const translatedTextContainer = document.createElement('div');
      translatedTextContainer.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      `;
      
      // 获取浏览器语言
      const browserLanguage = navigator.language || navigator.userLanguage || 'zh-CN';
      // 默认目标语言处理：确保中文用户可以轻松获得中文翻译
      let defaultTargetLang;
      
      // 如果用户浏览器首选语言是中文，默认目标语言也设为中文
      if (browserLanguage.toLowerCase().startsWith('zh')) {
        defaultTargetLang = 'zh';
      } else {
        // 否则根据浏览器语言设置默认目标语言
        defaultTargetLang = browserLanguage.split('-')[0] || 'zh';
      }
      
      console.log('默认目标语言设置为:', defaultTargetLang, '浏览器语言:', browserLanguage);
      
      const translatedTextLabel = document.createElement('div');
      translatedTextLabel.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 30px;
      `;
      
      const translationTitle = document.createElement('label');
      translationTitle.textContent = '翻译 (Translation)';
      translationTitle.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        color: #333;
        margin-right: 8px;
      `;
      
      const languageSelector = document.createElement('select');
      languageSelector.style.cssText = `
        padding: 4px 8px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        background-color: white;
        font-size: 14px;
        width: 90px;
      `;
      
      // 添加常用语言选项
      const languages = [
        { code: 'zh', name: '中文' },
        { code: 'en', name: '英文' },
        { code: 'ja', name: '日文' },
        { code: 'ko', name: '韩文' },
        { code: 'fr', name: '法文' },
        { code: 'de', name: '德文' },
        { code: 'es', name: '西班牙文' },
        { code: 'ru', name: '俄文' }
      ];
      
      languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        if (lang.code === defaultTargetLang) {
          option.selected = true;
        }
        languageSelector.appendChild(option);
      });
      
      translatedTextLabel.appendChild(translationTitle);
      translatedTextLabel.appendChild(languageSelector);
      
      const translatedTextBox = document.createElement('div');
      translatedTextBox.style.cssText = `
        padding: 15px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        background-color: #f9f9f9;
        font-size: 15px;
        height: 120px;
        overflow-y: auto;
        line-height: 1.5;
        resize: vertical;
      `;
      translatedTextBox.textContent = '翻译加载中...';
      
      translatedTextContainer.appendChild(translatedTextLabel);
      translatedTextContainer.appendChild(translatedTextBox);
      
      // 添加到预览容器
      textPreviewContainer.appendChild(originalTextContainer);
      textPreviewContainer.appendChild(translatedTextContainer);
      
      // 翻译功能
      async function translateText() {
        try {
          const targetLang = languageSelector.value;
          translatedTextBox.textContent = '翻译中...';
          
          // 从界面获取当前显示的原文，确保翻译的是用户看到的文本
          // 这解决了全局selectedText可能已过时的问题
          const actualText = originalTextBox.textContent.trim();
          
          console.log(`翻译文本长度: ${actualText.length}, 内容: ${actualText.substring(0, 20)}${actualText.length > 20 ? '...' : ''}`);
          
          // 检查特殊情况：当界面显示了生成的回复内容而非翻译内容时
          if (panel.querySelector('#reply-content-textarea') && 
              panel.querySelector('#reply-content-textarea').value && 
              !translatedTextBox.hasAttribute('data-translated')) {
            console.log('检测到界面显示了回复内容而非翻译内容，尝试强制翻译');
            
            // 强制设置合适的目标语言
            if (browserLanguage.toLowerCase().startsWith('zh')) {
              // 为中文用户设置中文
              for (let i = 0; i < languageSelector.options.length; i++) {
                if (languageSelector.options[i].value === 'zh') {
                  languageSelector.selectedIndex = i;
                  break;
                }
              }
            }
          }
          
          // 调用API翻译
          const translationResult = await translateSelectedText(actualText, targetLang);
          translatedTextBox.textContent = translationResult || '翻译失败，请重试';
          
          // 标记已翻译
          translatedTextBox.setAttribute('data-translated', 'true');
        } catch (error) {
          console.error('翻译出错:', error);
          translatedTextBox.textContent = '翻译失败: ' + (error.message || '未知错误');
        }
      }
      
      // 语言选择变化时重新翻译
      languageSelector.addEventListener('change', translateText);
      
      // 初始翻译
      setTimeout(translateText, 500);
      
      // 2. 选择器区域
      const selectors = document.createElement('div');
      selectors.style.cssText = `
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 0;
        padding: 4px 0;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 8px 10px;
        background-color: #f9f9f9;
      `;
      
      // 平台选择器
      const platformSelector = createSelector(
        '平台 (Platform)',
        [
          { value: 'auto', label: '自动检测', selected: true },
          { value: 'email', label: '邮件' },
          { value: 'tiktok', label: 'TikTok' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'facebook', label: 'Facebook' },
          { value: 'other', label: '其他' }
        ],
        platformInfo.type !== 'other' && platformInfo.type ? platformInfo.type : 'other'
      );
      
      // 场景选择器
      const scenarioSelector = createSelector(
        '场景 (Scenario)',
        [
          { value: 'auto', label: '自动检测', selected: true },
          { value: 'compliment', label: '夸夸' },
          { value: 'complaint', label: '不满' },
          { value: 'inquiry', label: '咨询' },
          { value: 'gratitude', label: '感谢' },
          { value: 'agreement', label: '协议' },
          { value: 'instruction', label: '指南' },
          { value: 'greeting', label: '问候' },
          { value: 'other', label: '其他' }
        ],
        scenarioResult.type
      );
      
      // 确定适合的语气类型
      function determineAppropriateStyle(text, scenarioType) {
        // 如果没有文本，默认使用专业语气
        if (!text || text.trim().length === 0) {
          return 'professional';
        }
        
        const normalizedText = text.toLowerCase();
        
        // 检测文本是否为正式文档
        const hasFormalLanguage = /privacy|policy|terms|agreement|条款|隐私|协议|政策|合同|license|right|版权|声明/i.test(normalizedText);
        
        // 检测是否包含法律、专业术语
        const hasLegalTerms = /legal|law|right|obligation|regulation|compliance|责任|义务|法律|权利|规范|合规/i.test(normalizedText);
        
        // 检测商业相关术语
        const hasBusinessTerms = /business|company|enterprise|corporation|service|product|client|customer|公司|企业|服务|产品|客户|用户/i.test(normalizedText);
        
        // 检测学术或专业内容特征
        const hasAcademicTerms = /research|study|analysis|thesis|paper|theory|data|science|研究|分析|论文|理论|数据|科学/i.test(normalizedText);
        
        // 检测文本结构特征
        const isLong = text.length > 200;
        const hasQuotes = (text.match(/"|"|「|」|『|』|'/g) || []).length > 1;
        const hasPunctuation = (text.match(/,|，|;|；|:|：/g) || []).length > 3;
        
        // 检测是否是官方、正式内容
        const isOfficial = hasFormalLanguage || hasLegalTerms || hasBusinessTerms || 
                           hasAcademicTerms || (isLong && (hasQuotes || hasPunctuation));
        
        // 检查特定场景
        if (scenarioType === 'complaint') {
          // 投诉场景应该更专业、正式
          return 'professional';
        }
        
        if (scenarioType === 'inquiry' && (isOfficial || hasBusinessTerms)) {
          // 商务或正式咨询应该更专业
          return 'professional';
        }
        
        if (scenarioType === 'compliment' && !isOfficial) {
          // 赞美场景通常可以更友好，除非是正式场合
          return 'friendly';
        }
        
        if (isOfficial) {
          // 正式文档、法律文本、商务文档等应该用专业语气
          return 'professional';
        }
        
        // 检测情感和语气特征
        // 检测是否有表情符号
        const hasEmoji = /\p{Emoji}/u.test(text);
        
        // 检测感叹号
        const hasExclamation = (text.match(/!|！/g) || []).length > 0;
        
        // 检测问号(表示疑问语气)
        const hasQuestions = (text.match(/\?|？/g) || []).length > 0;
        
        // 检测是否有口语化表达
        const hasColloquial = /hi|hey|hello|thanks|thank you|cool|awesome|nice|great|嗨|你好|谢谢|谢啦|棒|赞|不错|牛/i.test(normalizedText);
        
        // 检测情感词汇
        const hasPositiveEmotion = /happy|glad|pleased|excited|love|like|喜欢|开心|高兴|爱|满意/i.test(normalizedText);
        
        // 短文本(问候、简单表达)通常使用友好语气
        if (text.length < 50 && (hasColloquial || hasPositiveEmotion || !hasPunctuation)) {
          return 'friendly';
        }
        
        // 如果有表情、感叹号、口语化表达，倾向于友好语气
        if ((hasEmoji || hasExclamation || hasColloquial) && !isOfficial) {
          return 'friendly';
        }
        
        // 如果是提问但不是正式内容，可以用友好语气
        if (hasQuestions && !isOfficial && !hasBusinessTerms && text.length < 100) {
          return 'friendly';
        }
        
        // 对于无法明确判断的场景，默认使用专业语气
        return 'professional';
      }
      
      // 基于文本内容和检测到的场景自动判断适合的语气
      const detectedTone = determineAppropriateStyle(selectedText, scenarioResult.type);
      
      // 语气选择器
      const toneSelector = createSelector(
        '语气 (Tone)',
        [
          { value: 'friendly', label: '闺蜜风', selected: detectedTone === 'friendly' },
          { value: 'professional', label: '商务风', selected: detectedTone === 'professional' },
          { value: 'funny', label: '搞笑风', selected: false },
          { value: 'casual', label: '随意风', selected: false }
        ],
        detectedTone
      );
      
      // 生成按钮
      const generateButton = document.createElement('button');
      generateButton.textContent = '重新生成回复';
      generateButton.style.cssText = `
        padding: 8px 16px;
        background: linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        height: 38px;
        font-size: 15px;
        font-weight: 500;
        transition: all 0.2s ease;
        min-width: 100px;
        margin-left: 10px;
      `;
          
      generateButton.addEventListener('mouseover', function() {
        this.style.background = 'linear-gradient(135deg, #3e32bd 0%, #7437a8 100%)';
        this.style.boxShadow = '0 4px 8px rgba(74, 60, 219, 0.3)';
        this.style.transform = 'translateY(-1px)';
      });
          
      generateButton.addEventListener('mouseout', function() {
        this.style.background = 'linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%)';
        this.style.boxShadow = 'none';
        this.style.transform = 'none';
      });
          
      generateButton.addEventListener('click', () => {
        try {
          // 保存当前回复思路内容（如果已修改）
          const currentThought = thoughtTextarea.value;
          const isThoughtModified = currentThought && 
                                  currentThought !== '生成中...' && 
                                  userModifiedContent[currentTextHash]?.thought;
          
          // 显示加载中，但只在未修改的文本框中显示
          if (!isThoughtModified) {
            thoughtTextarea.value = '生成中...';
          }
          replyTextarea.value = '生成中...';
          
          // 确保保留用户修改的回复思路
          if (isThoughtModified && currentTextHash) {
            if (!userModifiedContent[currentTextHash]) {
              userModifiedContent[currentTextHash] = {};
            }
            userModifiedContent[currentTextHash].thought = currentThought;
            console.log('保留用户修改的回复思路');
          } else {
            // 只清除回复内容，保留思路
            if (currentTextHash && userModifiedContent[currentTextHash]) {
              const savedThought = userModifiedContent[currentTextHash].thought;
              delete userModifiedContent[currentTextHash].reply;
              if (savedThought) {
                userModifiedContent[currentTextHash].thought = savedThought;
              }
              console.log('清除回复内容，但保留思路');
            }
          }
          
          // 获取所有选择器的值
          const platform = platformSelector.querySelector('select').value;
          const scenario = scenarioSelector.querySelector('select').value;
          const tone = toneSelector.querySelector('select').value;
          
          // 设置思路文本
          const thoughtPrompt = `为${platformLabels[platform] || '通用平台'}上的${scenarioLabels[scenario] || '一般场景'}内容，使用${toneLabels[tone] || '友好语气'}风格生成回复的思路。原文：${selectedText.substring(0, 100)}${selectedText.length > 100 ? '...' : ''}`;
          
          // 生成回复思路和回复内容，指定只生成回复内容
          generateThoughtAndReply(
            selectedText, 
            platform, 
            scenario, 
            tone, 
            thoughtTextarea, 
            replyTextarea, 
            isThoughtModified // 添加标志表示是否应保留思路
          );
        } catch (btnError) {
          console.error('生成按钮点击处理出错:', btnError);
          showNotification('生成过程中出现错误，请重试');
        }
      });
      
      selectors.appendChild(platformSelector);
      selectors.appendChild(scenarioSelector);
      selectors.appendChild(toneSelector);
      selectors.appendChild(generateButton);
      
      // 3. 回复思路与回复内容区域
      const responseArea = document.createElement('div');
      responseArea.style.cssText = `
        display: flex;
        flex-direction: row;
        gap: 24px;
        width: 100%;
        box-sizing: border-box;
        margin-top: 16px;
      `;
      
      // 回复思路
      const thoughtContainer = document.createElement('div');
      thoughtContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 48%;
        flex: 0 0 48%;
        box-sizing: border-box;
      `;
      
      const thoughtLabel = document.createElement('label');
      thoughtLabel.textContent = '回复思路 (Reply Strategy)';
      thoughtLabel.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        color: #333;
      `;
      
      const thoughtTextarea = document.createElement('textarea');
      thoughtTextarea.style.cssText = `
        width: 100%;
        height: 300px;
        padding: 12px 15px;
        border: 1px solid #8741c5;
        border-radius: 8px;
        resize: vertical;
        font-size: 15px;
        line-height: 1.5;
        box-sizing: border-box;
        display: block;
        background-color: #f9f6fe;
        min-height: 250px;
      `;
      thoughtTextarea.placeholder = '生成中...';
      
      // 添加内容变更监听器，保存用户修改
      thoughtTextarea.addEventListener('input', function() {
        if (currentTextHash) {
          if (!userModifiedContent[currentTextHash]) {
            userModifiedContent[currentTextHash] = {};
          }
          userModifiedContent[currentTextHash].thought = this.value;
          console.log('保存用户修改的思路内容:', this.value.substring(0, 30) + '...');
        }
      });
      
      thoughtContainer.appendChild(thoughtLabel);
      thoughtContainer.appendChild(thoughtTextarea);
      
      // 回复内容
      const replyContainer = document.createElement('div');
      replyContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: 48%;
        flex: 0 0 48%;
        box-sizing: border-box;
      `;
      
      const replyLabel = document.createElement('label');
      replyLabel.textContent = '回复内容 (Reply Content)';
      replyLabel.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        color: #333;
      `;
      
      const replyTextarea = document.createElement('textarea');
      replyTextarea.style.cssText = `
        width: 100%;
        height: 300px;
        padding: 12px 15px;
        border: 1px solid #8741c5;
        border-radius: 8px;
        resize: vertical;
        font-size: 15px;
        line-height: 1.5;
        box-sizing: border-box;
        display: block;
        background-color: #f9f6fe;
        min-height: 250px;
      `;
      replyTextarea.placeholder = '生成中...';
      
      // 添加内容变更监听器，保存用户修改
      replyTextarea.addEventListener('input', function() {
        if (currentTextHash) {
          if (!userModifiedContent[currentTextHash]) {
            userModifiedContent[currentTextHash] = {};
          }
          userModifiedContent[currentTextHash].reply = this.value;
          console.log('保存用户修改的回复内容:', this.value.substring(0, 30) + '...');
        }
      });
      
      // 复制按钮
      const copyButton = document.createElement('button');
      copyButton.textContent = '一键复制';
      copyButton.style.cssText = `
        padding: 10px 20px;
        background: linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 10px;
        align-self: flex-end;
        font-size: 15px;
        transition: all 0.2s ease;
        min-width: 100px;
      `;
          
      copyButton.addEventListener('mouseover', function() {
        this.style.background = 'linear-gradient(135deg, #3e32bd 0%, #7437a8 100%)';
        this.style.boxShadow = '0 4px 8px rgba(74, 60, 219, 0.3)';
        this.style.transform = 'translateY(-1px)';
      });
          
      copyButton.addEventListener('mouseout', function() {
        this.style.background = 'linear-gradient(135deg, #4a3cdb 0%, #8741c5 100%)';
        this.style.boxShadow = 'none';
        this.style.transform = 'none';
      });
          
      copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(replyTextarea.value)
          .then(() => {
            showNotification('已复制到剪贴板');
            copyButton.textContent = '✓ 已复制';
            setTimeout(() => {
              copyButton.textContent = '一键复制';
            }, 2000);
          })
          .catch(err => {
            console.error('复制失败:', err);
            showNotification('复制失败，请重试');
          });
      });
      
      replyContainer.appendChild(replyLabel);
      replyContainer.appendChild(replyTextarea);
      replyContainer.appendChild(copyButton);
      
      responseArea.appendChild(thoughtContainer);
      responseArea.appendChild(replyContainer);
      
      // 将所有元素添加到内容区域
      content.appendChild(textPreviewContainer);
      content.appendChild(selectors);
      content.appendChild(responseArea);
      
      panel.appendChild(content);
      
      // 添加到页面
      document.body.appendChild(panel);
      
      // 确保图标被禁用
      window._blockFloatingIcon = true;
      // 再次移除所有图标元素
      hideFloatingIcon();
      
      // 触发初始生成
      try {
        const platform = platformSelector.querySelector('select').value;
        const scenario = scenarioSelector.querySelector('select').value;
        const tone = toneSelector.querySelector('select').value;
        
        // 检查是否有用户修改的内容
        if (currentTextHash && userModifiedContent[currentTextHash]) {
          console.log('检测到用户修改的内容，恢复保存的编辑');
          
          setTimeout(() => {
            // 填充已保存的用户修改内容
            if (userModifiedContent[currentTextHash].thought) {
              thoughtTextarea.value = userModifiedContent[currentTextHash].thought;
            } else {
              // 使用默认生成
              generateThoughtAndReply(selectedText, platform, scenario, tone, thoughtTextarea, replyTextarea);
            }
            
            if (userModifiedContent[currentTextHash].reply) {
              replyTextarea.value = userModifiedContent[currentTextHash].reply;
            } else if (!userModifiedContent[currentTextHash].thought) {
              // 如果思路也没有保存，则使用默认生成
              generateThoughtAndReply(selectedText, platform, scenario, tone, thoughtTextarea, replyTextarea);
            }
          }, 100);
        } else {
          // 没有用户修改，触发默认生成
          generateThoughtAndReply(selectedText, platform, scenario, tone, thoughtTextarea, replyTextarea);
        }
      } catch (genError) {
        console.error('初始生成回复时出错:', genError);
        thoughtTextarea.value = '生成失败，请点击"生成回复"按钮重试';
        replyTextarea.value = '生成失败，请点击"生成回复"按钮重试';
      }
    } catch (panelError) {
      console.error('创建面板时出错:', panelError);
      // 移除加载面板
      if (loadingPanel && loadingPanel.parentNode) {
        loadingPanel.remove();
      }
      showNotification('创建回复面板失败，请重试');
    }
  } catch (error) {
    console.error('显示回复面板函数中出错:', error);
    showNotification('无法显示回复面板，请重试');
  }
}

// 用于显示选择器标签对应的文本
const platformLabels = {
  'auto': '自动检测',
  'email': '邮件',
  'tiktok': 'TikTok',
  'instagram': 'Instagram',
  'facebook': 'Facebook',
  'other': '其他平台'
};

const scenarioLabels = {
  'auto': '自动检测',
  'compliment': '夸夸',
  'complaint': '不满',
  'inquiry': '咨询',
  'gratitude': '感谢',
  'agreement': '协议',
  'instruction': '指南',
  'greeting': '问候',
  'other': '一般场景'
};

const toneLabels = {
  'friendly': '闺蜜风',
  'professional': '商务风',
  'funny': '搞笑风',
  'casual': '随意风'
};

// 创建选择器组件
function createSelector(label, options, selectedValue = null) {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 5px;
    flex: 1;
  `;
  
  const labelElement = document.createElement('label');
  labelElement.textContent = label;
  labelElement.style.cssText = `
    font-size: 14px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    min-width: 40px;
  `;
  
  const select = document.createElement('select');
  select.style.cssText = `
    padding: 4px 8px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background-color: white;
    font-size: 14px;
    flex: 1;
  `;
  
  options.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    if (option.value === selectedValue || option.selected) {
      optionElement.selected = true;
    }
    select.appendChild(optionElement);
  });
  
  container.appendChild(labelElement);
  container.appendChild(select);
  
  return container;
}

// 计算选中文本的哈希值
async function hashSelectedText() {
  if (!selectedText) return '0';
  
  let hash = 0;
  for (let i = 0; i < Math.min(selectedText.length, 100); i++) {
    const char = selectedText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  return hash.toString();
}

// 生成回复思路和回复内容
async function generateThoughtAndReply(text, platform, scenario, tone, thoughtTextarea, replyTextarea, keepThought = false) {
  // 如果文本为空，直接返回
  if (!text || text.trim().length === 0) {
    console.error('无法生成回复：文本为空');
    thoughtTextarea.value = '无法生成回复：请提供文本内容';
    replyTextarea.value = '无法生成回复：请提供文本内容';
    return;
  }

  try {
    // 生成并保存当前文本的哈希用于区分不同文本
    const textHash = await hashSelectedText();
    currentTextHash = textHash;
    
    console.log(`开始为文本生成回复（哈希值: ${textHash}）：平台=${platform}, 场景=${scenario}, 语气=${tone}, 保留思路=${keepThought}`);
    
    // 检查用户修改的内容
    const hasModifiedThought = userModifiedContent[textHash]?.thought;
    const hasModifiedReply = userModifiedContent[textHash]?.reply;
    
    // 处理自动选项
    const actualPlatform = platform === 'auto' ? currentPlatform : platform;
    
    // 处理自动场景检测
    let actualScenario = scenario;
    if (scenario === 'auto') {
      try {
        // 避免重复调用场景检测
        const scenarioResult = await detectScenario(text);
        // 场景检测已经将'unknown'改为'other'，这里直接使用返回结果
        actualScenario = scenarioResult.type;
        console.log(`自动检测场景: ${actualScenario}, 置信度: ${scenarioResult.confidence}`);
      } catch (scenarioError) {
        console.error('场景自动检测失败:', scenarioError);
        actualScenario = 'other';
      }
    }
    
    // 根据情况决定是生成思路和回复，还是只生成回复
    if (keepThought) {
      console.log('保留用户修改的思路，仅生成回复内容');
      
      // 获取用户修改的思路内容作为输入
      const userThought = thoughtTextarea.value;
      console.log('使用自定义思路生成回复:', userThought.substring(0, 30) + (userThought.length > 30 ? '...' : ''));
      
      // 只生成回复内容，传递自定义思路
      let reply = await generateReply(
        text,
        actualPlatform,
        tone,
        actualScenario,
        false, // 不是生成思路
        userThought // 传递用户修改的思路
      );
      
      // 移除可能的首尾双引号
      reply = removeQuotes(reply);
      
      // 更新回复文本区域
      replyTextarea.value = reply;
      
      // 保存生成的回复
      if (!userModifiedContent[textHash]) {
        userModifiedContent[textHash] = {};
      }
      // 不更新思路，只更新回复
      userModifiedContent[textHash].reply = reply;
    } else {
      // 同时生成思路和回复
      console.log('同时生成思路和回复内容');
      
      let [thought, reply] = await Promise.all([
        // 生成思路（如果已有用户修改的思路则使用）
        hasModifiedThought || generateReply(
          text,
          actualPlatform,
          tone,
          actualScenario,
          true // 表示生成思路
        ),
        
        // 生成回复内容（如果已有用户修改的回复则使用）
        hasModifiedReply || generateReply(
          text,
          actualPlatform,
          tone,
          actualScenario
        )
      ]);
      
      // 移除回复内容中可能的首尾双引号
      reply = removeQuotes(reply);
      
      // 更新文本区域
      if (!hasModifiedThought) {
        thoughtTextarea.value = thought;
        
        // 保存生成的思路
        if (!userModifiedContent[textHash]) {
          userModifiedContent[textHash] = {};
        }
        userModifiedContent[textHash].thought = thought;
      }
      
      if (!hasModifiedReply) {
        replyTextarea.value = reply;
        
        // 保存生成的回复
        if (!userModifiedContent[textHash]) {
          userModifiedContent[textHash] = {};
        }
        userModifiedContent[textHash].reply = reply;
      }
    }
    
    console.log('回复生成完成');
  } catch (error) {
    console.error('生成失败:', error);
    if (!keepThought) {
      thoughtTextarea.value = '生成失败: ' + (error.message || '请稍后重试');
    }
    replyTextarea.value = '生成失败: ' + (error.message || '请稍后重试');
  }
}

// 移除回复面板
function removeReplyPanel() {
  const panel = document.getElementById('smart-reply-panel');
  if (panel) {
    console.log('移除回复面板');
    panel.remove();
  }
  
  // 重置禁用图标标志
  window._blockFloatingIcon = false;
  
  // 确保同时移除浮动图标
  hideFloatingIcon();
}

// 创建加载面板
function createLoadingPanel() {
  // 移除之前的面板
  removeReplyPanel();
  
  // 确保隐藏浮动图标
  hideFloatingIcon();
  
  console.log('创建加载面板');
  
  // 创建加载面板
  const panel = document.createElement('div');
  panel.id = 'smart-reply-panel';
  panel.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 300px;
    padding: 20px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 2147483647;
    text-align: center;
    font-family: Arial, sans-serif;
  `;
  
  // 创建加载动画
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    display: inline-block;
    width: 30px;
    height: 30px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top-color: #4285f4;
    animation: spin 1s ease-in-out infinite;
    margin-bottom: 10px;
  `;
  
  // 添加加载动画关键帧
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
  
  const loadingText = document.createElement('div');
  loadingText.textContent = '正在生成智能回复...';
  
  panel.appendChild(spinner);
  panel.appendChild(loadingText);
  document.body.appendChild(panel);
  
  return panel;
}

// 显示通知
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    z-index: 2147483647;
    font-family: Arial, sans-serif;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  console.log('显示通知:', message);
  
  // 3秒后自动移除
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 立即响应以保持连接
  try {
    sendResponse({ received: true });
  } catch (error) {
    console.warn('发送立即响应时出错:', error);
  }
  
  console.log('内容脚本收到消息:', message);
  
  if (message.action === 'generateReply') {
    // 处理右键菜单的生成回复请求
    console.log('收到生成回复请求:', message);
    
    // 保存选中的文本
    selectedText = message.selectedText || '';
    
    // 显示回复面板
    showReplyPanel();
  } 
  else if (message.action === 'platformInfoResult') {
    // 处理从后台脚本返回的平台信息
    console.log('收到平台信息结果:', message.platformInfo);
    if (message.platformInfo) {
      currentPlatform = message.platformInfo.type || 'other';
    }
  }
  
  // 返回true表示会异步发送响应
  return true;
});

// 开始初始化检查
checkInitialization();

// 强制触发测试按钮创建
setTimeout(() => {
  try {
    console.log('强制创建测试按钮');
    createTestButton();
  } catch (error) {
    console.error('强制创建按钮失败:', error);
  }
}, 3000);

// 确保contentScript.js加载时通知后台脚本
try {
  chrome.runtime.sendMessage({ 
    action: 'contentScriptLoaded',
    url: window.location.href
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn('通知后台脚本加载失败:', chrome.runtime.lastError.message);
    }
  });
} catch (error) {
  console.error('通知后台脚本时出错:', error);
}

// 添加错误恢复机制
window.addEventListener('error', function(event) {
  console.error('内容脚本发生错误:', event.error);
  // 可以在这里添加错误恢复逻辑
});

// 检查功能是否被禁用
function isFeatureDisabled() {
  try {
    // 检查URL是否在黑名单中
    const currentUrl = window.location.href.toLowerCase();
    
    // 不支持的网站列表（例如已知会导致问题的网站）
    const disabledDomains = [
      'mail.google.com',
      'docs.google.com',
      'drive.google.com',
      'github.com/settings',
      'accounts.google.com',
      'myaccount.google.com'
    ];
    
    // 检查URL是否包含任何禁用域名
    for (const domain of disabledDomains) {
      if (currentUrl.includes(domain)) {
        console.log('该网站在禁用列表中:', domain);
        return true;
      }
    }
    
    // 检查网站是否有明确禁止修改的标志
    const metaTags = document.querySelectorAll('meta[name="smart-reply-disabled"]');
    if (metaTags.length > 0) {
      console.log('网站明确禁用了Smart Reply功能');
      return true;
    }
    
    // 检查内容是否启用了CSP严格模式
    const cspMetaTags = document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    if (cspMetaTags.length > 0) {
      // 注意CSP存在，但不完全禁用功能
      console.log('网站使用了CSP，可能会限制部分功能');
    }
    
    return false;
  } catch (error) {
    console.warn('检查功能禁用状态时出错:', error);
    return false; // 出错时默认不禁用
  }
}

// 在页面加载完成后立即检查连接
setTimeout(checkBackgroundConnection, 1000);

// 添加监听器，用于处理图标点击事件
document.addEventListener('click', function(event) {
  // 检查是否点击了悬浮图标
  if (event.target.closest('#auto-reply-icon')) {
    console.log('智能回复图标被点击');
    hideFloatingIcon();
    showReplyPanel();
  } else {
    // 检查是否点击了面板之外的区域
    const panel = document.getElementById('smart-reply-panel');
    const icon = document.getElementById('auto-reply-icon');
    
    // 如果点击区域不在面板内，且不在图标内，则隐藏图标
    if (panel && !panel.contains(event.target) && icon && !icon.contains(event.target)) {
      console.log('点击在面板和图标之外，隐藏图标');
      hideFloatingIcon();
    }
  }
});

// 初始化时确保面板和图标不共存
function ensurePanelIconConsistency() {
  try {
    const panel = document.getElementById('smart-reply-panel');
    const icon = document.getElementById('auto-reply-icon');
    
    if (panel && icon) {
      console.log('检测到面板和图标同时存在，移除图标');
      hideFloatingIcon();
      window._blockFloatingIcon = true;
    }
  } catch (error) {
    console.error('检查面板和图标一致性时出错:', error);
  }
}

// 定期检查面板和图标的一致性
setInterval(ensurePanelIconConsistency, 500);

// 翻译选中的文本
async function translateSelectedText(text, targetLang) {
  // 重要：首先检查输入文本的长度是否匹配界面显示的文本长度，避免错误传参
  console.log(`要翻译的文本实际长度: ${text.length}`);
  
  // 确保文本长度正确，如果不匹配，尝试从界面获取正确的文本
  // 比较selectedText全局变量和传入的text是否一致
  if (text !== selectedText) {
    console.warn('传入的文本与选中文本不匹配，可能是全局selectedText被错误更新');
    
    // 尝试获取界面上显示的原文
    const originalTextBox = document.querySelector('#smart-reply-panel div[style*="原文"]');
    if (originalTextBox && originalTextBox.textContent && originalTextBox.textContent.trim().length > 0) {
      console.log('从界面获取原文文本');
      text = originalTextBox.textContent.trim();
      console.log(`修正后的文本长度: ${text.length}`);
    }
  }
  
  if (!text || text.trim().length === 0) {
    return '没有文本可供翻译';
  }
  
  try {
    console.log(`开始翻译文本到 ${targetLang} 语言，文本长度: ${text.length}, 文本内容: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`);
    
    // 短文本处理 - 对于特别短的文本跳过语言检测直接翻译
    const isVeryShortText = text.length < 15;
    
    // 如果不是特别短的文本，才进行语言检测
    let sourceLang = 'en'; // 默认假设为英文
    let skipLanguageCheck = false;
    
    if (isVeryShortText) {
      console.log('文本很短，跳过语言检测，直接进行翻译');
      skipLanguageCheck = true;
      
      // 对于短文本，基于目标语言做一个简单猜测
      if (targetLang === 'zh') {
        // 如果目标是中文，假设源语言是英文
        sourceLang = 'en';
      } else {
        // 如果目标不是中文，则假设源语言是中文
        sourceLang = 'zh';
      }
    } else {
      // 较长的文本进行正常的语言检测
      sourceLang = await detectLanguage(text);
      console.log(`检测到源语言: ${sourceLang}`);
    }
    
    // 即使源语言和目标语言相同，对于短文本我们也尝试翻译
    // 因为语言检测可能不太准确，尤其是对短文本
    if (sourceLang === targetLang && !isVeryShortText) {
      console.log('源语言与目标语言相同，无需翻译');
      // 特殊处理：当检测到英文文本且目标语言也是英文时，如果用户在浏览器中安装了中文语言，
      // 那么我们假设用户可能想要翻译成中文
      if (sourceLang === 'en' && navigator.language.toLowerCase().startsWith('zh')) {
        console.log('用户首选语言是中文，尝试将英文翻译成中文');
        sourceLang = 'en';
        targetLang = 'zh';
      } else {
        return `文本已经是${getLanguageName(targetLang)}，无需翻译。\n\n${text}`;
      }
    }
    
    // 对于短文本，即使源语言和目标语言相同，也继续尝试翻译
    if (isVeryShortText && sourceLang === targetLang) {
      console.log('短文本源语言与目标语言相同，但仍继续尝试翻译');
      
      // 特殊处理：当检测到英文文本且目标语言也是英文时，尝试翻译成用户首选语言
      if (sourceLang === 'en' && navigator.language.toLowerCase().startsWith('zh')) {
        console.log('用户首选语言是中文，短文本自动调整为中文翻译');
        targetLang = 'zh';
      }
    }
    
    // 针对不同语言组合定制翻译提示
    let translationPrompt;
    
    // 针对不同语言组合优化翻译提示
    if ((sourceLang === 'en' && targetLang === 'zh') || 
        (targetLang === 'zh' && (sourceLang !== 'zh' || isVeryShortText))) {
      // 任何语言翻译成中文
      if (isVeryShortText) {
        translationPrompt = `请将这段文本"${text}"翻译成中文。直接给出翻译结果，不要加引号，不要解释。`;
      } else {
        translationPrompt = `你是专业翻译。请将以下文本翻译成中文，保持原意并使表达自然流畅：\n\n${text}\n\n直接返回翻译结果，不要加解释。`;
      }
    } else if ((sourceLang === 'zh' && targetLang === 'en') || 
              (targetLang === 'en' && (sourceLang !== 'en' || isVeryShortText))) {
      // 任何语言翻译成英文
      if (isVeryShortText) {
        translationPrompt = `请将这段文本"${text}"翻译成英文。直接给出翻译结果，不要加引号，不要解释。`;
      } else {
        translationPrompt = `你是专业翻译。请将以下文本翻译成英文，保持原意并使表达自然流畅：\n\n${text}\n\n直接返回翻译结果，不要加解释。`;
      }
    } else {
      // 其他语言组合
      if (isVeryShortText) {
        translationPrompt = `请将这段文本"${text}"从${getLanguageName(sourceLang)}翻译成${getLanguageName(targetLang)}。直接给出翻译结果，不要加引号，不要解释。`;
      } else {
        translationPrompt = `你是专业翻译。请将以下${getLanguageName(sourceLang)}文本翻译成${getLanguageName(targetLang)}，保持原意并使表达自然流畅：\n\n${text}\n\n直接返回翻译结果，不要加解释。`;
      }
    }
    
    console.log('发送翻译请求，prompt:', translationPrompt.substring(0, 100) + (translationPrompt.length > 100 ? '...' : ''));
    
    // 使用API翻译，添加超时处理
    const translationPromise = generateReply(
      text, // 使用原始文本，让API有更好的上下文
      'other', // 平台类型
      'professional', // 语气
      'other', // 场景
      false, // 不是生成思路
      translationPrompt // 使用翻译提示
    );
    
    // 添加超时处理
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('翻译请求超时')), 25000)
    );
    
    // 竞争Promise
    console.log('等待翻译结果...');
    const translationResponse = await Promise.race([translationPromise, timeoutPromise]);
    console.log('收到翻译响应:', translationResponse ? '成功' : '失败');
    
    // 处理API可能返回的前缀
    let cleanResponse = translationResponse || '翻译失败，请重试';
    
    // 清理翻译结果
    cleanResponse = cleanResponse
      // 移除前缀
      .replace(/^(翻译结果：|翻译如下：|Translation:|Here is the translation:|Translated text:|翻译:|Translation result:|The translation is:)/i, '')
      // 移除尾部可能的注释
      .replace(/(\(This is [^)]+\)|\[This is [^\]]+\]|（这是[^）]+）|「这是[^」]+」)$/i, '')
      .trim();
    
    // 如果是短文本，尝试提取引号中的内容
    if (isVeryShortText) {
      console.log('处理短文本翻译结果:', cleanResponse);
      // 匹配各种可能的引号
      const quotedMatch = cleanResponse.match(/"([^"]+)"|"([^"]+)"|「([^」]+)」|【([^】]+)】|'([^']+)'|\(([^)]+)\)|\[([^\]]+)\]/);
      if (quotedMatch) {
        // 找到第一个非空的捕获组
        for (let i = 1; i < quotedMatch.length; i++) {
          if (quotedMatch[i]) {
            console.log('从引号中提取翻译结果:', quotedMatch[i]);
            cleanResponse = quotedMatch[i];
            break;
          }
        }
      }
    }
    
    // 对于特别短的文本，我们会处理一些常见情况
    if (isVeryShortText) {
      // 常见的短语翻译
      const commonPhrases = {
        // 英文到中文
        'en-zh': {
          'Thank you': '谢谢你',
          'Thanks': '谢谢',
          'Hello': '你好',
          'Hi': '嗨',
          'Yes': '是的',
          'No': '不',
          'OK': '好的',
          'Good': '好',
          'Bad': '坏',
          'Sorry': '对不起',
          'Welcome': '欢迎',
          'Please': '请',
          'Bye': '再见',
          'Good morning': '早上好',
          'Good afternoon': '下午好',
          'Good evening': '晚上好',
          'Good night': '晚安'
        },
        // 中文到英文
        'zh-en': {
          '谢谢': 'Thank you',
          '谢谢你': 'Thank you',
          '你好': 'Hello',
          '嗨': 'Hi',
          '是的': 'Yes',
          '不': 'No',
          '好的': 'OK',
          '好': 'Good',
          '坏': 'Bad',
          '对不起': 'Sorry',
          '欢迎': 'Welcome',
          '请': 'Please',
          '再见': 'Bye',
          '早上好': 'Good morning',
          '下午好': 'Good afternoon',
          '晚上好': 'Good evening',
          '晚安': 'Good night'
        }
      };
      
      // 检查常见短语
      const langPair = sourceLang + '-' + targetLang;
      if (langPair === 'en-zh' && commonPhrases['en-zh'][text]) {
        console.log('使用预定义的常见英译中短语');
        return commonPhrases['en-zh'][text];
      } else if (langPair === 'zh-en' && commonPhrases['zh-en'][text]) {
        console.log('使用预定义的常见中译英短语');
        return commonPhrases['zh-en'][text];
      }
      
      // 如果翻译结果与原文完全相同，视为专有名词
      if (cleanResponse === text) {
        console.log('翻译结果与原文相同，可能是专有名词');
        return `${text} (可能为专有名词)`;
      }
    }
    
    console.log('最终翻译结果:', cleanResponse);
    return cleanResponse;
  } catch (error) {
    console.error('翻译文本时出错:', error);
    return `翻译服务暂时不可用: ${error.message || '未知错误'}。请稍后再试。`;
  }
}

// 检测文本语言
async function detectLanguage(text) {
  // 简单的语言检测逻辑
  
  // 如果文本为空或太短，无法可靠检测
  if (!text || text.trim().length === 0) {
    console.log('文本为空，无法检测语言');
    return 'en'; // 默认为英文
  }
  
  // 记录要检测的文本
  console.log('检测语言的文本:', text.substring(0, 20) + (text.length > 20 ? '...' : ''));
  
  // 检测中文字符
  const chinesePattern = /[\u4e00-\u9fa5]/;
  if (chinesePattern.test(text)) {
    console.log('检测到中文字符');
    return 'zh';
  }
  
  // 检测日文字符 (这里保留日文特有的字符检测，去掉与中文重叠的部分)
  const japanesePattern = /[\u3040-\u30ff\uff66-\uff9f]/;
  if (japanesePattern.test(text)) {
    console.log('检测到日文字符');
    return 'ja';
  }
  
  // 检测韩文字符
  const koreanPattern = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\uffa0-\uffdf\u3200-\u321f]/;
  if (koreanPattern.test(text)) {
    console.log('检测到韩文字符');
    return 'ko';
  }
  
  // 检测俄文字符
  const russianPattern = /[\u0400-\u04FF]/;
  if (russianPattern.test(text)) {
    console.log('检测到俄文字符');
    return 'ru';
  }
  
  // 检测西班牙语/法语/德语等常见字符
  const latinExtendedPattern = /[áàâäéèêëíìîïóòôöúùûüçñß]/i;
  
  // 根据特定字符组合判断语言
  if (latinExtendedPattern.test(text)) {
    // 尝试使用安全的方式计数
    try {
      // 西班牙语特征
      const spanishChars = text.match(/[áéíóúüñ¿¡]/gi);
      const spanishCount = spanishChars ? spanishChars.length : 0;
      
      // 法语特征
      const frenchChars = text.match(/[àâæçéèêëîïôœùûüÿ]/gi);
      const frenchCount = frenchChars ? frenchChars.length : 0;
      
      // 德语特征
      const germanChars = text.match(/[äöüß]/gi);
      const germanCount = germanChars ? germanChars.length : 0;
      
      if (spanishCount > 2) {
        console.log('检测到西班牙语特征');
        return 'es';
      } else if (frenchCount > 2) {
        console.log('检测到法语特征');
        return 'fr';
      } else if (germanCount > 2) {
        console.log('检测到德语特征');
        return 'de';
      }
    } catch (error) {
      console.error('语言检测出错:', error);
      // 出错时默认为英文
    }
  }
  
  // 判断是否为英文文本
  // 如果包含英文字母且不包含其他语言特征，则认为是英文
  const englishPattern = /[a-zA-Z]/;
  if (englishPattern.test(text)) {
    console.log('检测到英文字符');
    return 'en';
  }
  
  console.log('无法确定语言，默认为英文');
  // 默认假设为英文
  return 'en';
}

// 获取语言名称
function getLanguageName(langCode) {
  const langMap = {
    'zh': '中文',
    'en': '英文',
    'ja': '日文',
    'ko': '韩文',
    'fr': '法文',
    'de': '德文',
    'es': '西班牙文',
    'ru': '俄文'
  };
  
  return langMap[langCode] || langCode;
}

// 添加移除首尾双引号的函数
function removeQuotes(text) {
  if (!text) return text;
  
  // 移除首尾的双引号
  let trimmed = text.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.substring(1, trimmed.length - 1).trim();
  }
  return trimmed;
}