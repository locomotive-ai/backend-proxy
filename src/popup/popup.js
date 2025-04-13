/**
 * 智能回复生成器 - 弹出页面脚本
 */

import { generateReply, isApiKeyConfigured, saveApiKey } from '../services/api';

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
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const apiKeyInput = document.getElementById('api-key');
  const saveSettingsBtn = document.getElementById('save-settings');
  
  // 订阅相关DOM元素
  const freeLimitBanner = document.getElementById('free-limit-banner');
  const usageCountDisplay = document.getElementById('usage-count');
  const upgradeBtn = document.getElementById('upgrade-btn-banner');
  const monthlyPlanBtn = document.getElementById('monthly-plan-btn');
  const yearlyPlanBtn = document.getElementById('yearly-plan-btn');
  const subscriptionStatusDisplay = document.getElementById('subscription-status-display');
  const limitReachedModal = document.getElementById('limit-reached-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const closeModalX = document.querySelector('.close-modal');
  const upgradeFromModalBtn = document.getElementById('upgrade-from-modal');
  const contactSupportLink = document.getElementById('contact-support');
  
  // 方案标签
  const freePlanLabel = document.getElementById('free-plan-label');
  const monthlyPlanLabel = document.getElementById('monthly-plan-label');
  const yearlyPlanLabel = document.getElementById('yearly-plan-label');
  
  // 订阅和使用统计相关变量
  let usageCount = 0;
  let usageLimit = 3; // 免费版每日使用限制
  let subscriptionType = 'free';
  
  // 跟踪思路是否被用户修改
  let thoughtModified = false;
  
  // 初始化UI
  init();
  
  // 设置事件监听器 - 基本功能
  generateBtn.addEventListener('click', handleGenerateReply);
  copyBtn.addEventListener('click', handleCopyReply);
  
  // 保存设置按钮
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
  }
  
  // 订阅相关事件监听器
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => switchToSubscriptionTab());
  }
  
  if (monthlyPlanBtn) {
    monthlyPlanBtn.addEventListener('click', () => handleSubscribe('monthly'));
  }
  
  if (yearlyPlanBtn) {
    yearlyPlanBtn.addEventListener('click', () => handleSubscribe('yearly'));
  }
  
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => hideModal(limitReachedModal));
  }
  
  if (closeModalX) {
    closeModalX.addEventListener('click', () => hideModal(limitReachedModal));
  }
  
  if (upgradeFromModalBtn) {
    upgradeFromModalBtn.addEventListener('click', () => {
      hideModal(limitReachedModal);
      switchToSubscriptionTab();
    });
  }
  
  if (contactSupportLink) {
    contactSupportLink.addEventListener('click', event => {
      event.preventDefault();
      // 打开客服支持页面或邮件
      chrome.tabs.create({ url: 'mailto:support@autoreply.com' });
    });
  }
  
  // 监听思路文本框的修改
  thoughtTextarea.addEventListener('input', function() {
    // 如果思路文本框内容不是"生成中..."且不为空，标记为已修改
    if (thoughtTextarea.value.trim() !== '生成中...' && thoughtTextarea.value.trim() !== '') {
      thoughtModified = true;
    }
  });
  
  // 标签页切换
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabId = this.getAttribute('data-tab');
      
      // 更新活动标签
      tabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      
      // 切换内容区域
      tabContents.forEach(content => {
        content.classList.add('hidden');
      });
      
      document.getElementById(`${tabId}-panel`).classList.remove('hidden');
    });
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
    
    // 加载API密钥
    loadApiKey();
    
    // 加载订阅状态和使用计数
    await loadSubscriptionData();
    
    // 检查API密钥配置
    try {
      const hasApiKey = await isApiKeyConfigured();
      if (!hasApiKey) {
        showNotification('请先在设置页面配置API密钥', 'error');
      }
    } catch (error) {
      console.error('检查API密钥配置失败:', error);
    }
  }
  
  /**
   * 加载API密钥
   */
  function loadApiKey() {
    chrome.storage.sync.get(['apiKey'], function(result) {
      if (result.apiKey && apiKeyInput) {
        apiKeyInput.value = result.apiKey;
      }
    });
  }
  
  /**
   * 加载订阅数据
   */
  async function loadSubscriptionData() {
    try {
      // 从存储中获取订阅数据
      const result = await new Promise(resolve => 
        chrome.storage.sync.get(['subscription', 'usageCount', 'usageDate'], resolve)
      );
      
      // 处理订阅状态
      if (result.subscription) {
        subscriptionType = result.subscription.type || 'free';
        updateSubscriptionDisplay();
      } else {
        subscriptionType = 'free';
        updateSubscriptionDisplay();
      }
      
      // 处理使用计数
      const today = new Date().toDateString();
      
      if (result.usageDate === today) {
        usageCount = result.usageCount || 0;
      } else {
        // 新的一天，重置计数
        usageCount = 0;
        await saveUsageCount();
      }
      
      updateUsageCountDisplay();
    } catch (error) {
      console.error('加载订阅数据失败:', error);
      // 使用默认值
      subscriptionType = 'free';
      usageCount = 0;
      updateSubscriptionDisplay();
      updateUsageCountDisplay();
    }
  }
  
  /**
   * 更新订阅显示
   */
  function updateSubscriptionDisplay() {
    // 更新订阅状态显示
    if (subscriptionStatusDisplay) {
      subscriptionStatusDisplay.textContent = subscriptionType === 'free' ? '免费版' : '专业版';
    }
    
    // 更新订阅横幅
    if (freeLimitBanner) {
      freeLimitBanner.style.display = subscriptionType === 'free' ? 'flex' : 'none';
    }
    
    // 更新订阅页面当前方案标记
    if (freePlanLabel) freePlanLabel.style.display = subscriptionType === 'free' ? 'block' : 'none';
    if (monthlyPlanLabel) monthlyPlanLabel.style.display = subscriptionType === 'monthly' ? 'block' : 'none';
    if (yearlyPlanLabel) yearlyPlanLabel.style.display = subscriptionType === 'yearly' ? 'block' : 'none';
    
    // 如果已经订阅，隐藏相应的订阅按钮
    if (monthlyPlanBtn) monthlyPlanBtn.style.display = subscriptionType === 'monthly' ? 'none' : 'block';
    if (yearlyPlanBtn) yearlyPlanBtn.style.display = subscriptionType === 'yearly' ? 'none' : 'block';
  }
  
  /**
   * 更新使用计数显示
   */
  function updateUsageCountDisplay() {
    if (usageCountDisplay) {
      usageCountDisplay.textContent = usageCount;
    }
  }
  
  /**
   * 保存使用计数
   */
  async function saveUsageCount() {
    const today = new Date().toDateString();
    
    try {
      await new Promise(resolve => 
        chrome.storage.sync.set({ 
          usageCount: usageCount,
          usageDate: today
        }, resolve)
      );
    } catch (error) {
      console.error('保存使用计数失败:', error);
    }
  }
  
  /**
   * 增加使用计数
   * @returns {boolean} 是否可以继续使用
   */
  async function incrementUsageCount() {
    // 如果是专业版，无需计数
    if (subscriptionType !== 'free') {
      return true;
    }
    
    // 检查是否已达上限
    if (usageCount >= usageLimit) {
      showLimitReachedModal();
      return false;
    }
    
    // 增加计数
    usageCount += 1;
    updateUsageCountDisplay();
    
    // 保存到存储
    await saveUsageCount();
    
    // 检查增加后是否达到上限
    if (usageCount >= usageLimit) {
      showNotification('今日使用次数已达上限，请考虑升级专业版', 'error');
    }
    
    return true;
  }
  
  /**
   * 显示达到使用限制的模态框
   */
  function showLimitReachedModal() {
    if (limitReachedModal) {
      limitReachedModal.classList.remove('hidden');
    }
  }
  
  /**
   * 隐藏模态框
   */
  function hideModal(modal) {
    if (modal) {
      modal.classList.add('hidden');
    }
  }
  
  /**
   * 切换到订阅标签页
   */
  function switchToSubscriptionTab() {
    // 找到订阅标签并点击
    const subscriptionTab = Array.from(tabs).find(tab => tab.getAttribute('data-tab') === 'subscription');
    if (subscriptionTab) {
      subscriptionTab.click();
    }
  }
  
  /**
   * 处理订阅
   * @param {string} planType 方案类型 ('monthly'|'yearly')
   */
  async function handleSubscribe(planType) {
    try {
      // 显示处理中状态
      const targetBtn = planType === 'monthly' ? monthlyPlanBtn : yearlyPlanBtn;
      const originalText = targetBtn.textContent;
      targetBtn.textContent = '处理中...';
      targetBtn.disabled = true;
      
      // 这里通常会调用支付处理API
      // 简化示例：直接模拟支付成功
      
      // 模拟延迟
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 更新订阅状态
      subscriptionType = planType;
      
      // 保存到存储
      await new Promise(resolve => 
        chrome.storage.sync.set({ 
          subscription: {
            type: planType,
            startDate: new Date().toISOString(),
            endDate: new Date(Date.now() + (planType === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString()
          }
        }, resolve)
      );
      
      // 更新UI显示
      updateSubscriptionDisplay();
      
      // 显示成功消息
      showNotification(`成功订阅${planType === 'monthly' ? '月度' : '年度'}专业版！`, 'success');
      
      // 恢复按钮状态
      targetBtn.textContent = originalText;
      targetBtn.disabled = false;
    } catch (error) {
      console.error('订阅处理失败:', error);
      showNotification('订阅处理过程中出错，请稍后重试', 'error');
      
      // 恢复按钮状态
      if (targetBtn) {
        targetBtn.textContent = originalText;
        targetBtn.disabled = false;
      }
    }
  }
  
  /**
   * 保存设置
   */
  async function handleSaveSettings() {
    if (!apiKeyInput) return;
    
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showNotification('API密钥不能为空', 'error');
      return;
    }
    
    try {
      await saveApiKey(apiKey);
      showNotification('设置已保存', 'success');
    } catch (error) {
      console.error('保存设置失败:', error);
      showNotification('保存设置失败: ' + error.message, 'error');
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
    
    // 检查使用限制
    const canProceed = await incrementUsageCount();
    if (!canProceed) {
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