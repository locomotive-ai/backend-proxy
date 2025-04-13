/**
 * 智能回复生成器 - 弹出页面脚本
 */

import { generateReply, isApiKeyConfigured } from '../services/api';

document.addEventListener('DOMContentLoaded', function() {
  // 获取DOM元素
  const inputTextArea = document.getElementById('input-text');
  const platformSelect = document.getElementById('platform-select');
  const scenarioSelect = document.getElementById('scenario-select');
  const toneSelect = document.getElementById('tone-select');
  const generateBtn = document.getElementById('generate-btn');
  const thoughtTextarea = document.getElementById('thought-textarea');
  const replyTextarea = document.getElementById('reply-textarea');
  const copyBtn = document.getElementById('copy-btn');
  
  // 跟踪思路是否被用户修改
  let thoughtModified = false;
  
  // 初始化UI
  init();
  
  // 设置事件监听器 - 基本功能
  generateBtn.addEventListener('click', handleGenerateReply);
  copyBtn.addEventListener('click', handleCopyReply);
  
  // 监听思路文本框的修改
  thoughtTextarea.addEventListener('input', function() {
    // 如果思路文本框内容不是"生成中..."且不为空，标记为已修改
    if (thoughtTextarea.value.trim() !== '生成中...' && thoughtTextarea.value.trim() !== '') {
      thoughtModified = true;
    }
  });
  
  /**
   * 初始化函数
   */
  async function init() {
    // 获取URL中的文本参数（如果有）
    const urlParams = new URLSearchParams(window.location.search);
    const textParam = urlParams.get('text');
    
    if (textParam) {
      inputTextArea.value = textParam;
    }
    
    // 初始化复制按钮状态
    updateCopyButtonVisibility();
    
    // 检查API密钥配置
    try {
      const hasApiKey = await isApiKeyConfigured();
      if (!hasApiKey) {
        showNotification('请先配置API密钥', 'error');
      }
    } catch (error) {
      console.error('检查API密钥配置失败:', error);
    }
  }
  
  /**
   * 处理生成回复
   */
  async function handleGenerateReply() {
    const text = inputTextArea.value.trim();
    if (!text) {
      showNotification('请输入需要回复的内容', 'error');
      return;
    }
    
    // 显示生成中状态
    if (!thoughtModified) {
      thoughtTextarea.value = '生成中...';
    }
    replyTextarea.value = '生成中...';
    generateBtn.disabled = true;
    updateCopyButtonVisibility(false);
    
    // 获取选项值
    const platform = platformSelect.value;
    const scenario = scenarioSelect.value;
    const tone = toneSelect.value;
    
    try {
      // 如果思路没有被修改，生成新的思路
      let thoughtPromise = Promise.resolve(thoughtTextarea.value);
      if (!thoughtModified) {
        thoughtPromise = generateReply(text, platform, tone, scenario, true);
      }
      
      // 根据是否有自定义思路，使用不同的API调用
      const customThought = thoughtModified ? thoughtTextarea.value : null;
      const replyPromise = generateReply(text, platform, tone, scenario, false, customThought);
      
      // 并行执行请求
      const [thought, reply] = await Promise.all([
        thoughtPromise,
        replyPromise
      ]);
      
      // 更新UI
      if (!thoughtModified) {
        thoughtTextarea.value = thought;
      }
      replyTextarea.value = reply;
      
      // 请求完成，启用按钮
      generateBtn.disabled = false;
      updateCopyButtonVisibility(true);
      
      // 通知生成完成
      showNotification('回复生成完成', 'success');
    } catch (error) {
      console.error('生成回复失败:', error);
      
      // 请求失败，启用按钮
      generateBtn.disabled = false;
      
      // 显示错误消息
      showNotification(error.message || '生成回复失败，请稍后重试', 'error');
      
      // 保持已有思路，但更新回复文本框
      if (!thoughtModified) {
        thoughtTextarea.value = '生成失败，请重试';
      }
      replyTextarea.value = '生成失败，请重试';
      updateCopyButtonVisibility(false);
    }
  }
  
  /**
   * 更新复制按钮可见性
   */
  function updateCopyButtonVisibility(show = false) {
    if (copyBtn) {
      copyBtn.style.display = show ? 'block' : 'none';
    }
  }
  
  /**
   * 处理复制回复内容
   */
  function handleCopyReply() {
    const replyText = replyTextarea.value.trim();
    if (!replyText || replyText === '生成中...' || replyText === '生成失败，请重试') {
      return;
    }
    
    // 复制到剪贴板
    navigator.clipboard.writeText(replyText)
      .then(() => {
        showNotification('已复制到剪贴板', 'success');
      })
      .catch(err => {
        console.error('复制失败:', err);
        showNotification('复制失败', 'error');
      });
  }
  
  /**
   * 显示通知
   * @param {string} message 通知消息
   * @param {string} type 通知类型 ('success' 或 'error')
   */
  function showNotification(message, type) {
    // 查找现有通知
    let notification = document.querySelector('.alert');
    
    // 如果没有,创建一个新的
    if (!notification) {
      notification = document.createElement('div');
      notification.className = `alert alert-${type}`;
      const content = document.querySelector('.content');
      content.insertBefore(notification, content.firstChild);
    } else {
      // 更新现有通知的类型
      notification.className = `alert alert-${type}`;
    }
    
    // 设置消息
    notification.textContent = message;
    
    // 3秒后自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }
}); 