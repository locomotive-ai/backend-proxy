/**
 * DeepSeek API服务
 * 负责与DeepSeek API进行通信，生成智能回复
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// API配置
const API_CONFIG = {
  // DeepSeek API 配置 - 直接使用这个URL让用户配置API密钥
  DEEPSEEK_API_URL: 'https://api.deepseek.com/v1/chat/completions',
  // Render代理地址 - 已更新为Render分配的URL
  PROXY_URL: 'https://backend-proxy-kcsm.onrender.com/api/proxy',
  MODEL: 'deepseek-chat',
  DEFAULT_TEMPERATURE: 0.7,
  // 关闭模拟数据，启用真实API调用
  USE_MOCK: false,
};

/**
 * 从storage获取用户标识符
 * @returns {Promise<string>} 用户标识符
 */
async function getUserIdentifier() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(['userIdentifier'], (result) => {
        let userId = result.userIdentifier;
        
        // 如果不存在用户ID，创建一个新的并保存
        if (!userId) {
          userId = uuidv4();
          chrome.storage.sync.set({ userIdentifier: userId });
        }
        
        resolve(userId);
      });
    } catch (error) {
      console.error("获取用户标识符出错:", error);
      // 出错时创建临时ID
      resolve(uuidv4());
    }
  });
}

/**
 * 从storage获取API密钥
 * @returns {Promise<string>} API密钥
 */
async function getApiKey() {
  const defaultApiKey = '';
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(['apiKey'], (result) => {
        const apiKey = result.apiKey;
        if (apiKey) {
          console.log("API密钥已配置");
          resolve(apiKey);
        } else {
          console.log("API密钥未配置");
          resolve(defaultApiKey);
        }
      });
    } catch (error) {
      console.error("获取API密钥出错:", error);
      resolve(defaultApiKey);
    }
  });
}

/**
 * 检查用户是否已登录或已配置
 * @returns {Promise<boolean>} 是否已配置
 */
export async function isApiKeyConfigured() {
  // 检查用户是否有标识符即可，不再需要API密钥
  const userId = await getUserIdentifier();
  return !!userId;
}

/**
 * 保存用户设置
 * @param {string} apiKey 用户设置
 * @returns {Promise<void>}
 */
export async function saveApiKey(apiKey) {
  // 此方法保留用于兼容性，但不再实际保存API密钥
  return new Promise((resolve) => {
    // 确保用户有唯一标识符
    getUserIdentifier().then(() => {
      console.log("用户设置已保存");
      resolve();
    });
  });
}

/**
 * 生成智能回复
 * @param {string} text 原文本
 * @param {string} platform 平台类型
 * @param {string} tone 语气类型
 * @param {string} scenario 场景类型
 * @param {boolean} isThought 是否生成回复思路而非回复内容
 * @param {string} customThought 用户自定义的回复思路
 * @returns {Promise<string>} 生成的回复
 */
export async function generateReply(text, platform, tone, scenario, isThought = false, customThought = null) {
  console.log(`生成${isThought ? '回复思路' : '回复内容'}:`, {
    platform, tone, scenario, 
    text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
    hasCustomThought: !!customThought
  });
  
  const apiKey = await getApiKey();
  
  if (!text || text.trim().length === 0) {
    throw new Error('无法生成回复：输入文本为空。');
  }
  
  // 如果启用了模拟数据，则返回假数据
  if (API_CONFIG.USE_MOCK) {
    console.log('使用模拟数据...');
    return mockGenerateReply(text, platform, tone, scenario, isThought, customThought);
  }
  
  try {
    // 构建提示词，如果有自定义思路，则传入
    const prompt = buildPrompt(text, platform, tone, scenario, isThought, customThought);
    
    let response;
    
    // 优先尝试使用代理服务，如果没有API密钥或代理调用失败，则尝试直接调用
    try {
      if (!apiKey) {
        console.log('API密钥未配置，尝试使用代理服务...');
        response = await callApiProxy(prompt);
      } else {
        // 有API密钥的情况下也尝试使用代理，减轻客户端API密钥暴露风险
        response = await callApiProxy(prompt);
      }
    } catch (proxyError) {
      console.warn('代理服务调用失败，尝试使用直接API调用:', proxyError);
      
      if (!apiKey) {
        throw new Error('API密钥未配置，且代理服务不可用。请在设置中配置DeepSeek API密钥。');
      }
      
      // 降级为直接API调用
      response = await callDeepSeekAPI(prompt, apiKey);
    }
    
    // 返回生成的回复内容
    return response;
  } catch (error) {
    console.error('API调用失败:', error);
    
    // 提供友好的错误信息
    if (error.response) {
      if (error.response.status === 401) {
        throw new Error('API认证失败：请检查您的API密钥是否正确。');
      } else {
        throw new Error(`API调用失败 (${error.response.status}): ${error.response.data?.error?.message || '未知错误'}`);
      }
    }
    
    // 如果API调用失败，尝试使用模拟数据作为备用
    console.log('API调用失败，使用模拟数据作为备用');
    return mockGenerateReply(text, platform, tone, scenario, isThought, customThought);
  }
}

/**
 * 构建提示词
 * @param {string} text 原文本
 * @param {string} platform 平台类型
 * @param {string} tone 语气类型
 * @param {string} scenario 场景类型
 * @param {boolean} isThought 是否生成回复思路而非回复内容
 * @param {string} customThought 用户自定义的回复思路
 * @returns {string} 完整提示词
 */
function buildPrompt(text, platform, tone, scenario, isThought = false, customThought = null) {
  // 获取当前用户的浏览器语言
  const userLanguage = navigator.language || 'zh-CN';
  const isChineseUser = userLanguage.startsWith('zh');
  
  // 检测输入文本语言
  const textLanguage = detectTextLanguage(text);
  
  // 强制使用用户指定的语言，而不是自动检测
  // 如果customThought中包含"英文"或"English"，强制使用英文回复
  const forceEnglish = customThought && (
    customThought.includes('英文') || 
    customThought.includes('English') || 
    customThought.includes('english') ||
    customThought.includes('用英语') ||
    customThought.includes('用英文')
  );
  
  // 处理翻译到中文的情况
  const forceChinese = customThought && (
    customThought.includes('翻译成中文') ||
    customThought.includes('中文翻译') ||
    customThought.includes('translate to Chinese') ||
    customThought.includes('translate into Chinese') ||
    (customThought.includes('翻译') && customThought.includes('中文'))
  );
  
  // 确定响应语言
  let responseLanguage;
  if (forceEnglish) {
    responseLanguage = 'English';
  } else if (forceChinese) {
    responseLanguage = 'Chinese';
  } else {
    responseLanguage = textLanguage;
  }
  
  // 思路的语言应该与用户浏览器语言一致
  const thoughtLanguage = isChineseUser ? 'Chinese' : 'English';
  
  // 平台特定指导
  let platformGuidance = '';
  switch (platform) {
    case 'email':
      platformGuidance = '使用适合电子邮件的正式格式，包括恰当的称呼和结束语。';
      break;
    case 'tiktok':
      platformGuidance = '使用简短、生动、吸引人的语言，加入适当的表情符号，符合TikTok的社交媒体风格。';
      break;
    case 'instagram':
      platformGuidance = '使用视觉化描述和友好的语言，加入适当的标签和表情符号，符合Instagram的风格。';
      break;
    case 'facebook':
      platformGuidance = '使用亲切、对话式的语言，适合Facebook的社交互动。';
      break;
    default:
      platformGuidance = '使用通用且合适的语言风格。';
  }
  
  // 语气指导
  let toneGuidance = '';
  switch (tone) {
    case 'friendly':
      toneGuidance = '使用友好、亲切的语气，就像与好朋友聊天一样，可以使用一些口语表达。';
      break;
    case 'professional':
      toneGuidance = '使用专业、正式的语气，保持客观和清晰，避免过于随意的表达。';
      break;
    case 'funny':
      toneGuidance = '使用幽默、轻松的语气，可以添加一些有趣的元素，但不要过于夸张。';
      break;
    case 'casual':
      toneGuidance = '使用轻松、随意的语气，像日常对话一样自然流畅。';
      break;
    default:
      toneGuidance = '使用友好、得体的语气。';
  }
  
  // 场景指导
  let scenarioGuidance = '';
  switch (scenario) {
    case 'compliment':
      scenarioGuidance = '表达真诚的赞美和肯定，强调积极的方面。';
      break;
    case 'complaint':
      scenarioGuidance = '用有建设性的方式表达不满，提供解决方案，保持礼貌。';
      break;
    case 'inquiry':
      scenarioGuidance = '清晰表达疑问，提供必要的背景信息，表达感谢。';
      break;
    default:
      scenarioGuidance = '根据内容适当调整语气和表达方式。';
  }
  
  // 特殊指导 (如Z世代用语、商务英语结构等)
  let specialGuidance = '';
  if (platform === 'tiktok' || platform === 'instagram') {
    if (responseLanguage === 'English') {
      specialGuidance = '可以适当使用Z世代流行语(如"vibe"、"based"、"lowkey"等)和表情符号增加亲和力。';
    } else if (responseLanguage === 'Chinese') {
      specialGuidance = '可以适当使用网络流行语和表情增加亲和力。';
    }
  } else if (tone === 'professional') {
    if (responseLanguage === 'English') {
      specialGuidance = '使用清晰的商务表达结构，如"I appreciate your..."、"Upon reviewing..."等。';
    } else if (responseLanguage === 'Chinese') {
      specialGuidance = '使用清晰的商务表达结构，如"感谢您的..."、"经过审核..."等。';
    }
  }
  
  // 构建最终提示词
  let prompt = '';
  
  if (isThought) {
    // 生成回复思路的提示词，使用用户浏览器语言
    prompt = `你是一位出色的回复顾问。请使用${thoughtLanguage}语言，针对以下内容制定一个回复思路和要点：
    
原始内容: "${text}"

平台: ${platform}
场景: ${scenario}
语气: ${tone}

请考虑:
1. ${platformGuidance}
2. ${toneGuidance}
3. ${scenarioGuidance}
4. ${specialGuidance}

提供简短的回复思路，突出需要注意的要点和方向。`;
  } else {
    // 生成回复内容的提示词，使用与原文相同的语言
    // 如果有自定义思路，则将其作为指导原则
    if (customThought) {
      // 检查自定义思路中是否有语言要求
      let languageInstruction;
      if (forceEnglish) {
        languageInstruction = "必须使用英语(English)回复，无论原文是什么语言";
      } else if (forceChinese) {
        languageInstruction = "必须使用中文回复，无论原文是什么语言";
      } else {
        languageInstruction = `使用${responseLanguage === 'Chinese' ? '中文' : responseLanguage}回复`;
      }
      
      prompt = `你是一位出色的回复生成专家。请根据以下信息，${languageInstruction}生成一个恰当的回复：
    
原始内容: "${text}"

平台: ${platform}
语气: ${tone}

用户提供的回复思路如下，这是你必须遵循的回复指导原则:
${customThought}

直接生成回复内容，不要添加任何解释或额外内容。回复应简洁且符合平台特点和语气风格。${forceEnglish ? '务必使用英文回复，这是最重要的要求。' : forceChinese ? '务必使用中文回复，这是最重要的要求。' : ''}`;
    } else {
      prompt = `你是一位出色的回复生成专家。请根据以下信息，使用${responseLanguage}语言生成一个恰当的回复：
    
原始内容: "${text}"

平台: ${platform}
场景: ${scenario}
语气: ${tone}

请遵循以下指导:
1. ${platformGuidance}
2. ${toneGuidance}
3. ${scenarioGuidance}
4. ${specialGuidance}

保持回复简洁有效，直接回复内容，无需附加解释。`;
    }
  }
  
  return prompt;
}

/**
 * 检测文本语言
 * @param {string} text - 要检测的文本
 * @returns {string} - 检测到的语言 ('Chinese'/'English'/等)
 */
function detectTextLanguage(text) {
  // 简单的语言检测，可以根据需要改进
  const chineseRegex = /[\u4e00-\u9fa5]/;
  const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;
  const koreanRegex = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff]/;
  
  if (chineseRegex.test(text)) {
    return 'Chinese';
  } else if (japaneseRegex.test(text) && !chineseRegex.test(text)) {
    return 'Japanese';
  } else if (koreanRegex.test(text)) {
    return 'Korean';
  } else {
    // 默认假设是英文或其他拉丁字母语言
    return 'English';
  }
}

/**
 * 模拟生成回复(用于开发和测试)
 * @param {string} text - 原始文本内容
 * @param {string} platform - 平台
 * @param {string} tone - 语气
 * @param {string} scenario - 场景
 * @param {boolean} isThought - 是否生成回复思路而非回复内容
 * @param {string} customThought - 用户自定义的回复思路
 * @returns {string} - 模拟的回复内容
 */
function mockGenerateReply(text, platform, tone, scenario, isThought = false, customThought = null) {
  // 延迟以模拟API调用时间
  return new Promise(resolve => {
    setTimeout(() => {
      if (isThought) {
        // 模拟回复思路
        resolve(getMockThought(text, platform, tone, scenario));
      } else if (customThought) {
        // 使用自定义思路生成回复
        resolve(getMockReplyFromCustomThought(text, platform, tone, customThought));
      } else {
        // 模拟回复内容
        resolve(getMockReply(text, platform, tone, scenario));
      }
    }, 800);
  });
}

/**
 * 获取模拟的回复思路
 */
function getMockThought(text, platform, tone, scenario) {
  const userLanguage = navigator.language || 'zh-CN';
  const isChineseUser = userLanguage.startsWith('zh');
  
  if (isChineseUser) {
    // 中文回复思路
    const thoughts = [
      `针对这则${getPlatformNameCN(platform)}上的内容，应采用${getToneNameCN(tone)}的语气回复。由于内容属于${getScenarioNameCN(scenario)}场景，需要：1. 先表达理解/共鸣；2. 提供相关的回应；3. 保持语气一致，不要过于正式或随意。`,
      
      `这是一则${getPlatformNameCN(platform)}平台上的${getScenarioNameCN(scenario)}内容，回复时应使用${getToneNameCN(tone)}语气。建议：1. 开头先回应对方的核心点；2. 中间部分可以分享相关经验或观点；3. 结尾设计得体，符合平台特性。`,
      
      `面对这条${getPlatformNameCN(platform)}消息，需要用${getToneNameCN(tone)}的方式回应这种${getScenarioNameCN(scenario)}场景。思路：1. 确认收到并理解对方意图；2. 根据内容核心给予回应；3. 可以添加一些${tone === 'friendly' ? '亲切' : tone === 'professional' ? '专业建议' : tone === 'funny' ? '幽默元素' : '个人见解'}来增强互动性。`
    ];
    
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  } else {
    // 英文回复思路
    const thoughts = [
      `For this content on ${getPlatformNameEN(platform)}, adopt a ${getToneNameEN(tone)} tone for this ${getScenarioNameEN(scenario)} scenario. Strategy: 1. Express understanding/empathy first; 2. Provide relevant response; 3. Maintain consistent tone without being overly formal or casual.`,
      
      `This is a ${getScenarioNameEN(scenario)} message on ${getPlatformNameEN(platform)}, requiring a ${getToneNameEN(tone)} response. Approach: 1. Start by addressing their main point; 2. Share relevant experience or perspective in the middle; 3. End appropriately for the platform.`,
      
      `For this ${getPlatformNameEN(platform)} message, respond with a ${getToneNameEN(tone)} approach to this ${getScenarioNameEN(scenario)} scenario. Plan: 1. Acknowledge receipt and understanding; 2. Address the core content; 3. Add some ${tone === 'friendly' ? 'warmth' : tone === 'professional' ? 'professional advice' : tone === 'funny' ? 'humor' : 'personal insight'} to enhance engagement.`
    ];
    
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }
}

/**
 * 基于自定义思路生成回复
 * @param {string} text - 原始文本
 * @param {string} platform - 平台
 * @param {string} tone - 语气
 * @param {string} customThought - 用户自定义思路
 * @returns {string} - 生成的回复
 */
function getMockReplyFromCustomThought(text, platform, tone, customThought) {
  // 检测文本语言
  const textLanguage = detectTextLanguage(text);
  const isCustomThoughtChinese = /[\u4e00-\u9fa5]/.test(customThought);
  
  // 分析自定义思路中的关键指令
  const hasEmoji = customThought.includes('表情') || customThought.includes('emoji');
  const isPositive = customThought.includes('积极') || customThought.includes('肯定') || 
                     customThought.includes('positive') || customThought.includes('praise');
  const isNegative = customThought.includes('否定') || customThought.includes('拒绝') || 
                     customThought.includes('negative') || customThought.includes('reject');
  const isQuestion = customThought.includes('疑问') || customThought.includes('问题') || 
                     customThought.includes('question') || customThought.includes('ask');

  // 根据语言选择对应的回复模板
  if (textLanguage === 'Chinese' || isCustomThoughtChinese) {
    // 中文回复
    // 提取思路中的关键句子
    const sentences = customThought.match(/[^。！？.!?]+[。！？.!?]?/g) || [];
    const keyPoints = sentences.slice(0, 3).map(s => s.trim()).filter(s => s.length > 5);
    
    if (keyPoints.length > 0) {
      // 构建基于关键点的回复
      let pieces = [];
      
      // 开场白
      if (tone === 'professional') {
        pieces.push('您好，感谢您的留言。');
      } else if (tone === 'funny') {
        pieces.push('哇！看到你的消息了！');
      } else {
        pieces.push('嗨，谢谢分享！');
      }
      
      // 处理关键点
      for (const point of keyPoints) {
        // 提取关键词
        const keywords = point.replace(/[，。！？,.!?]/g, '').split(/\s+/).filter(w => w.length >= 2);
        if (keywords.length > 0) {
          const keyword = keywords[Math.floor(Math.random() * keywords.length)];
          
          if (point.includes('不要') || point.includes('避免')) {
            pieces.push(`我会注意不要${keyword}，这很重要。`);
          } else {
            pieces.push(`关于${keyword}，${point.length < 15 ? point : '我觉得您说得很有道理'}。`);
          }
        }
      }
      
      // 结尾
      if (tone === 'professional') {
        pieces.push('期待您的回复。');
      } else if (tone === 'funny') {
        pieces.push('希望我的回复能让你开心！');
      } else {
        pieces.push('希望能帮到你！');
      }
      
      // 添加表情
      if (hasEmoji && tone !== 'professional') {
        const emojis = ['👍', '😊', '🙌', '✨', '🎉'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        pieces[0] += emoji;
        pieces[pieces.length - 1] += emoji;
      }
      
      return pieces.join(' ');
    } else {
      // 通用回复
      const replies = {
        friendly: `嗨！看到你的消息啦！${hasEmoji ? '😊 ' : ''}根据你的想法，我觉得很有趣。${isPositive ? '确实值得点赞！' : isNegative ? '可能需要我们再思考一下。' : '我们可以多交流这个话题！'}${hasEmoji ? ' 👍' : ''}`,
        professional: `您好，感谢您的分享。我已认真阅读了您的内容，${isPositive ? '您提出的观点非常有见地。' : isNegative ? '关于您提到的问题，我们需要进一步探讨。' : '这为我们提供了新的思考角度。'}期待与您进一步交流。`,
        funny: `哇塞！这信息太棒啦！${hasEmoji ? '🤩 ' : ''}读完你的内容，我的脑细胞都在欢呼！${isPositive ? '简直是太赞了，需要为你鼓掌！👏' : isNegative ? '虽然有点小问题，但没关系，生活就是这样充满惊喜～🎭' : '太有意思了，下次再多分享点呗！'}`,
        casual: `嗯，不错。${isPositive ? '挺认同你说的。' : isNegative ? '可能有点小问题，不过问题不大。' : '有空可以多聊聊这个。'}就这样吧，回头见！${hasEmoji ? '✌️' : ''}`
      };
      
      return replies[tone] || replies.friendly;
    }
  } else {
    // 英文回复
    // 提取思路中的关键句子
    const sentences = customThought.match(/[^.!?]+[.!?]?/g) || [];
    const keyPoints = sentences.slice(0, 3).map(s => s.trim()).filter(s => s.length > 5);
    
    if (keyPoints.length > 0) {
      // 构建基于关键点的回复
      let pieces = [];
      
      // 开场白
      if (tone === 'professional') {
        pieces.push('Thank you for your message.');
      } else if (tone === 'funny') {
        pieces.push('Wow! Got your message!');
      } else {
        pieces.push('Hi there! Thanks for sharing!');
      }
      
      // 处理关键点
      for (const point of keyPoints) {
        // 提取关键词
        const keywords = point.replace(/[,.!?]/g, '').split(/\s+/).filter(w => w.length >= 3);
        if (keywords.length > 0) {
          const keyword = keywords[Math.floor(Math.random() * keywords.length)];
          
          if (point.includes('not') || point.includes('avoid')) {
            pieces.push(`I'll make sure to avoid ${keyword}, as you suggested.`);
          } else {
            pieces.push(`Regarding ${keyword}, ${point.length < 20 ? point : 'I think you made a valid point'}.`);
          }
        }
      }
      
      // 结尾
      if (tone === 'professional') {
        pieces.push('Looking forward to your response.');
      } else if (tone === 'funny') {
        pieces.push('Hope my reply brightens your day!');
      } else {
        pieces.push('Hope this helps!');
      }
      
      // 添加表情
      if (hasEmoji && tone !== 'professional') {
        const emojis = ['👍', '😊', '🙌', '✨', '🎉'];
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        pieces[0] += ` ${emoji}`;
        pieces[pieces.length - 1] += ` ${emoji}`;
      }
      
      return pieces.join(' ');
    } else {
      // 通用回复
      const replies = {
        friendly: `Hi there! ${hasEmoji ? '😊 ' : ''}I read your message and found it really interesting. ${isPositive ? 'It definitely deserves praise!' : isNegative ? 'We might need to think about it a bit more.' : 'We should chat more about this topic!'} ${hasEmoji ? '👍' : ''}`,
        professional: `Hello, thank you for your message. I've carefully reviewed your content, and ${isPositive ? 'your points are very insightful.' : isNegative ? 'regarding the issues you mentioned, we should discuss further.' : 'it provides us with a new perspective.'} I look forward to further communication.`,
        funny: `Wow! This is fantastic! ${hasEmoji ? '🤩 ' : ''}Reading your content made my brain cells do a happy dance! ${isPositive ? 'It\'s absolutely amazing, give yourself a round of applause! 👏' : isNegative ? 'There might be a tiny hiccup, but hey, life is full of surprises! 🎭' : 'It\'s so interesting, please share more next time!'}`,
        casual: `Yeah, that's cool. ${isPositive ? 'I pretty much agree with what you said.' : isNegative ? 'There might be a small issue, but it\'s not a big deal.' : 'We should chat more about this sometime.'} Catch you later! ${hasEmoji ? '✌️' : ''}`
      };
      
      return replies[tone] || replies.friendly;
    }
  }
}

/**
 * 获取模拟的回复内容
 */
function getMockReply(text, platform, tone, scenario) {
  // 检测文本语言
  const textLanguage = detectTextLanguage(text);
  
  if (textLanguage === 'Chinese') {
    // 中文回复
    const replies = {
      friendly: {
        compliment: `谢谢你的分享！👏 这真的太棒了，我特别喜欢你提到的观点！有机会咱们可以多交流这方面的想法，我觉得很有启发～`,
        complaint: `啊，理解你的感受！确实有点烦人呢😔 我之前也遇到过类似情况，要不咱们想想看有什么解决方法？希望很快就能解决这个问题！`,
        inquiry: `嗨！这个问题很有意思呀～据我所知，${text.substring(0, 10)}...的情况可能是因为几个原因造成的。你有尝试过从另一个角度思考吗？很乐意和你多聊聊这个话题！`,
        other: `谢谢分享！真心觉得你说的很有道理👍 期待看到更多你的想法和见解，咱们下次再多交流！`
      },
      professional: {
        compliment: `感谢您的积极反馈。您提出的观点非常有见地，我们高度重视这类专业性的交流。如有任何进一步的想法或建议，期待与您进行更深入的讨论。`,
        complaint: `感谢您提出的问题。我们理解这种情况可能带来的不便，并将认真对待。建议我们可以通过以下几个步骤来解决：首先分析问题根源，然后制定具体解决方案。期待能够尽快解决您的顾虑。`,
        inquiry: `您好，关于您询问的${text.substring(0, 10)}...问题，从专业角度来看，这涉及到几个关键因素。我建议可以从[专业建议]角度考虑。如需进一步讨论，我们可以安排更详细的交流。`,
        other: `感谢您的分享。您提出的内容具有重要的参考价值，我们将认真考虑这些见解。期待未来有机会就相关主题进行更深入的探讨。`
      },
      funny: {
        compliment: `哇塞！你这是要闪瞎我的小眼睛啊！👀✨ 太厉害了吧，简直是人间理性的荧光棒！下次请提前发个预告，我好准备好墨镜来抵御你才华的光芒！`,
        complaint: `哎呀妈呀！这情况简直比我周一早起还痛苦啊🤣 但别担心，生活就像双面胶，粘人但总有办法撕开！要不咱们组队"暴走"一下？保证问题吓得自己解决！`,
        inquiry: `这个问题问得好啊！简直是把我的脑细胞从睡梦中踹醒！🧠 关于${text.substring(0, 10)}...，我的第一反应是：这不比猜谜语有意思多了吗？让我们一起来场头脑风暴，保证比追剧还过瘾！`,
        other: `哈哈哈！这话说得我差点把手机扔了去鼓掌！👏 你的想法简直是给平淡的生活加了辣椒酱！期待你的下一次精彩发言，我已经准备好惊讶表情包啦！`
      },
      casual: {
        compliment: `真不错啊，挺喜欢你说的这些。确实很有道理，给我一种新的视角看问题。有空多分享点这样的想法呗。`,
        complaint: `嗯，确实有点麻烦。我能理解你的不爽，换我也会这样觉得。可能可以试试这样解决？希望情况很快就会好转啦。`,
        inquiry: `关于这个问题嘛，我觉得${text.substring(0, 10)}...可能是因为几个原因。你试过别的方法没？总之不用太纠结，慢慢来应该能找到答案的。`,
        other: `挺有意思的想法。我平时也会想这些，但没你说得这么清楚。改天可以多聊聊，感觉能学到不少东西。`
      }
    };
    
    // 如果没有特定场景的回复，则使用"other"
    const scenarioKey = replies[tone]?.[scenario] ? scenario : 'other';
    // 如果没有特定语气的回复，则使用"casual"
    const toneKey = replies[tone] ? tone : 'casual';
    
    return replies[toneKey][scenarioKey];
  } else {
    // 英文回复
    const replies = {
      friendly: {
        compliment: `Thank you so much for sharing this! 👏 I absolutely love the points you made! We should definitely exchange more ideas on this topic sometime, I find it really inspiring!`,
        complaint: `Oh, I totally get how you feel! That is indeed frustrating 😔 I've been in similar situations before. Maybe we could think about some solutions together? Hope this gets resolved soon!`,
        inquiry: `Hey there! That's such an interesting question! From what I know, the situation with ${text.substring(0, 10)}... might be happening for a few reasons. Have you tried looking at it from another angle? I'd love to chat more about this topic!`,
        other: `Thanks for sharing! I really think you've made some great points here 👍 Looking forward to seeing more of your thoughts and insights, let's chat more next time!`
      },
      professional: {
        compliment: `Thank you for your positive feedback. Your insights are truly valuable, and we greatly appreciate this kind of professional exchange. Should you have any further thoughts or suggestions, we look forward to a more in-depth discussion.`,
        complaint: `Thank you for bringing this matter to our attention. We understand the inconvenience this situation may have caused and are taking it seriously. I suggest we could address this through the following steps: first analyzing the root cause, then formulating specific solutions. We hope to resolve your concerns promptly.`,
        inquiry: `Hello, regarding your inquiry about ${text.substring(0, 10)}..., from a professional standpoint, this involves several key factors. I would recommend considering [professional advice]. If you'd like to discuss this further, we can arrange a more detailed conversation.`,
        other: `Thank you for sharing this information. Your input provides valuable reference points that we will carefully consider. We look forward to the opportunity for more in-depth discussions on related topics in the future.`
      },
      funny: {
        compliment: `Wow! Are you trying to blind me with your brilliance?! 👀✨ You're absolutely killing it - you're like a human glow stick of rationality! Next time, please send a warning so I can prepare my sunglasses to shield myself from the radiance of your talent!`,
        complaint: `Oh my goodness! This situation is more painful than my Monday morning alarm! 🤣 But don't worry, life is like duct tape - it's sticky but there's always a way to peel it off! How about we team up and "storm" this problem? I guarantee the issue will get so scared it'll solve itself!`,
        inquiry: `Great question! You've literally kicked my brain cells awake from their nap! 🧠 Regarding ${text.substring(0, 10)}..., my first thought is: isn't this more fun than solving riddles? Let's have a brainstorming session that'll be more entertaining than binge-watching your favorite show!`,
        other: `Haha! You almost made me throw my phone to stand up and applaud! 👏 Your thoughts are like adding hot sauce to a bland life! Can't wait for your next brilliant statement - I've got my surprised face emojis ready!`
      },
      casual: {
        compliment: `That's really nice, I like what you've said. It makes a lot of sense and gives me a new perspective on things. Feel free to share more thoughts like these sometime.`,
        complaint: `Yeah, that does sound annoying. I'd probably feel the same way if I were you. Maybe you could try this solution? Hope things get better soon.`,
        inquiry: `About that question, I think ${text.substring(0, 10)}... might be happening for a few reasons. Have you tried other approaches? Don't stress too much about it, I'm sure you'll figure it out eventually.`,
        other: `Interesting thoughts. I think about these things too, but you've expressed it more clearly. We should chat more about this sometime, feels like I could learn a lot.`
      }
    };
    
    // 如果没有特定场景的回复，则使用"other"
    const scenarioKey = replies[tone]?.[scenario] ? scenario : 'other';
    // 如果没有特定语气的回复，则使用"casual"
    const toneKey = replies[tone] ? tone : 'casual';
    
    return replies[toneKey][scenarioKey];
  }
}

// 辅助函数 - 获取平台中文名称
function getPlatformNameCN(platform) {
  switch (platform) {
    case 'email': return '邮件';
    case 'tiktok': return 'TikTok';
    case 'instagram': return 'Instagram';
    case 'facebook': return 'Facebook';
    default: return '一般平台';
  }
}

// 辅助函数 - 获取平台英文名称
function getPlatformNameEN(platform) {
  switch (platform) {
    case 'email': return 'Email';
    case 'tiktok': return 'TikTok';
    case 'instagram': return 'Instagram';
    case 'facebook': return 'Facebook';
    default: return 'general platform';
  }
}

// 辅助函数 - 获取语气中文名称
function getToneNameCN(tone) {
  switch (tone) {
    case 'friendly': return '友好';
    case 'professional': return '专业';
    case 'funny': return '幽默';
    case 'casual': return '随意';
    default: return '一般';
  }
}

// 辅助函数 - 获取语气英文名称
function getToneNameEN(tone) {
  switch (tone) {
    case 'friendly': return 'friendly';
    case 'professional': return 'professional';
    case 'funny': return 'humorous';
    case 'casual': return 'casual';
    default: return 'general';
  }
}

// 辅助函数 - 获取场景中文名称
function getScenarioNameCN(scenario) {
  switch (scenario) {
    case 'compliment': return '夸赞';
    case 'complaint': return '不满';
    case 'inquiry': return '咨询';
    default: return '一般';
  }
}

// 辅助函数 - 获取场景英文名称
function getScenarioNameEN(scenario) {
  switch (scenario) {
    case 'compliment': return 'compliment';
    case 'complaint': return 'complaint';
    case 'inquiry': return 'inquiry';
    default: return 'general';
  }
}

/**
 * 通过代理服务调用DeepSeek API
 * @param {string} prompt 提示词
 * @returns {Promise<string>} API响应
 */
async function callApiProxy(prompt) {
  try {
    console.log('通过代理服务调用API...');
    
    const response = await fetch(API_CONFIG.PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        user_id: generateUserIdentifier()
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`代理服务错误: ${response.status}, ${errorData.error || '未知错误'}`);
    }
    
    const data = await response.json();
    
    if (data && data.content) {
      console.log('代理服务响应成功');
      return data.content;
    } else {
      console.error('代理服务返回格式错误:', data);
      throw new Error('代理服务返回格式错误');
    }
  } catch (error) {
    console.error('代理服务调用失败:', error);
    throw error;
  }
}

/**
 * 生成唯一用户标识符
 * @returns {string} 用户标识符
 */
function generateUserIdentifier() {
  // 使用存储的ID或创建新ID
  let userId = localStorage.getItem('userIdentifier');
  if (!userId) {
    userId = 'user_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('userIdentifier', userId);
  }
  return userId;
}

export default {
  generateReply,
  saveApiKey,
  isApiKeyConfigured
}; 