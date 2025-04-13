/**
 * 场景检测工具
 * 通过关键词分析识别文本场景类型
 */

// 导入compromise.js用于轻量级NLP分析
import nlp from 'compromise';

// 缓存加载的关键词库
let scenariosCache = null;

// 调试模式
const DEBUG = true;

/**
 * 加载场景关键词库
 * @returns {Promise<Object>} 关键词库对象
 */
export async function loadScenarios() {
  if (scenariosCache) {
    return scenariosCache;
  }

  try {
    const response = await fetch(chrome.runtime.getURL('assets/scenarios.json'));
    scenariosCache = await response.json();
    if (DEBUG) console.log('成功加载场景关键词库:', Object.keys(scenariosCache));
    return scenariosCache;
  } catch (error) {
    console.error('加载关键词库失败:', error);
    // 提供一个增强的备用关键词库
    return {
      compliment: [
        'love', 'amazing', 'good', 'nice', 'great', 'excellent', 'perfect', 'wonderful',
        'awesome', 'outstanding', 'impressive', 'exceptional', 'brilliant', 'superb',
        '好喜欢', '喜欢', '赞', '棒', '优秀', '出色', '完美', '太好了', '厉害', '满意',
        '不错', '给力', '精彩', '佩服', '欣赏', '称赞', '推荐', '真棒', '大赞', '赞美'
      ],
      complaint: [
        'refund', 'bad', 'issue', 'problem', 'terrible', 'disappointing', 'broken', 'fault',
        'poor', 'worst', 'complaint', 'dissatisfied', 'unhappy', 'unsatisfied', 'fix',
        '坏了', '差评', '退款', '问题', '差', '不满', '失望', '糟糕', '难用', '故障',
        '投诉', '不好', '缺陷', '无法', '不能', '欺骗', '骗子', '垃圾', '难受', '烂'
      ],
      inquiry: [
        'how to', 'where', 'when', 'what', 'why', 'delivery', 'help', 'assist', 'support',
        'question', 'inquiry', 'ask', 'wondering', 'guide', 'guidance', 'explain', 'could you',
        '咨询', '怎么', '如何', '哪里', '什么', '为什么', '什么时候', '能否', '请问',
        '帮忙', '支持', '指导', '询问', '解释', '说明', '教程', '不懂', '需要了解', '是否可以'
      ],
      gratitude: [
        'thank', 'thanks', 'appreciate', 'grateful', 'thankful',
        '感谢', '谢谢', '多谢', '感激', '谢意', '致谢', '鸣谢', '幸运', '荣幸'
      ]
    };
  }
}

/**
 * 检测文本中的场景类型
 * @param {string} text 要分析的文本
 * @returns {Promise<Object>} 包含场景类型和置信度的对象
 */
export async function detectScenario(text) {
  if (!text) {
    if (DEBUG) console.log('场景检测：无文本内容');
    return { type: 'other', confidence: 0 };
  }

  if (DEBUG) console.log('开始场景检测，文本长度:', text.length, '文本开头:', text.substring(0, 30));

  try {
    const scenarios = await loadScenarios();
    const normalizedText = text.toLowerCase();
    const matches = {};
    
    // 增加场景类型识别
    const agreementPattern = /agreement|policy|terms|条款|协议|政策|承诺|保证/i;
    const instructionPattern = /instruction|guide|tutorial|manual|how to|step by step|步骤|指南|教程|说明书|使用说明/i;
    const reviewPattern = /review|recommend|rating|评价|评论|推荐|评分|点评/i;
    const greetingPattern = /hi|hello|morning|afternoon|evening|greetings|hey|你好|早上好|下午好|晚上好|问候|嗨|哈喽/i;

    // 添加更多场景检测
    if (agreementPattern.test(text)) {
      console.log('检测到协议/政策类文本');
      return { 
        type: 'agreement', 
        confidence: 0.9,
        matchedKeywords: ['agreement', 'policy', 'terms'],
        textHash: hashText(text)
      };
    }
    
    if (instructionPattern.test(text)) {
      console.log('检测到指南/教程类文本');
      return { 
        type: 'instruction', 
        confidence: 0.85,
        matchedKeywords: ['guide', 'tutorial', 'instruction'],
        textHash: hashText(text)
      };
    }
    
    if (reviewPattern.test(text)) {
      // 进一步区分正面评价和负面评价
      const positiveSentiments = /good|great|excellent|awesome|love|like|recommend|喜欢|推荐|好|棒|赞/i;
      const negativeSentiments = /bad|terrible|awful|disappointed|hate|dislike|不好|差|垃圾|失望|讨厌/i;
      
      if (positiveSentiments.test(text)) {
        console.log('检测到正面评价');
        return { 
          type: 'compliment', 
          confidence: 0.8,
          matchedKeywords: ['review', 'recommend', 'good'],
          textHash: hashText(text)
        };
      }
      
      if (negativeSentiments.test(text)) {
        console.log('检测到负面评价');
        return { 
          type: 'complaint', 
          confidence: 0.8,
          matchedKeywords: ['review', 'bad', 'disappointed'],
          textHash: hashText(text)
        };
      }
      
      console.log('检测到中性评价');
      return { 
        type: 'review', 
        confidence: 0.7,
        matchedKeywords: ['review', 'rating'],
        textHash: hashText(text)
      };
    }
    
    if (greetingPattern.test(text) && text.length < 100) {
      console.log('检测到问候类文本');
      return { 
        type: 'greeting', 
        confidence: 0.9,
        matchedKeywords: ['hello', 'hi', 'greetings'],
        textHash: hashText(text)
      };
    }
    
    // 计算每个场景类型的匹配次数和匹配权重
    for (const [type, keywords] of Object.entries(scenarios)) {
      matches[type] = { count: 0, weight: 0, keywords: [] };
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        // 计算出现次数
        let occurrences = 0;
        let position = -1;
        
        // 使用更精确的匹配方法，避免部分匹配
        const wordRegex = new RegExp(`\\b${lowerKeyword}\\b|${lowerKeyword}`, 'gi');
        while ((position = normalizedText.indexOf(lowerKeyword, position + 1)) !== -1) {
          occurrences++;
          
          // 检查词的上下文，增加权重判断
          const contextStart = Math.max(0, position - 20);
          const contextEnd = Math.min(normalizedText.length, position + lowerKeyword.length + 20);
          const context = normalizedText.substring(contextStart, contextEnd);
          
          if (DEBUG && occurrences === 1) {
            console.log(`关键词"${keyword}"在上下文中: "${context}"`);
          }
        }
        
        if (occurrences > 0) {
          // 基于关键词长度、出现频率和位置计算权重
          // 较长的关键词和出现在开头的关键词有更高权重
          const positionWeight = normalizedText.indexOf(lowerKeyword) < normalizedText.length / 3 ? 1.5 : 1.0;
          const lengthWeight = Math.min(lowerKeyword.length / 3, 2);
          const keywordWeight = lengthWeight * occurrences * positionWeight;
          
          matches[type].count += occurrences;
          matches[type].weight += keywordWeight;
          matches[type].keywords.push(keyword);
          
          if (DEBUG) {
            console.log(`关键词匹配: "${keyword}" 在场景 "${type}" 中出现 ${occurrences} 次，` +
                       `位置权重 ${positionWeight.toFixed(2)}, 总权重 ${keywordWeight.toFixed(2)}`);
          }
        }
      }
    }
    
    // 寻找匹配度最高的场景类型（基于权重）
    let bestMatch = { type: 'other', weight: 0 };
    for (const [type, data] of Object.entries(matches)) {
      if (data.weight > bestMatch.weight) {
        bestMatch = { type, weight: data.weight, keywords: data.keywords };
      }
    }
    
    // 使用compromise进行更复杂的情感分析和特征提取
    const doc = nlp(text);
    
    // 提取情感指标
    let sentiment = 0;
    
    // 积极情感词汇和句型检测
    if (doc.has('(amazing|excellent|awesome|great|love|wonderful|好|棒|喜欢|赞|优秀|满意)')) {
      sentiment += 1.5;
      if (DEBUG) console.log('检测到强烈积极情感表达 +1.5');
    } else if (doc.has('(good|nice|pleased|happy|glad|喜欢|不错|可以|满意)')) {
      sentiment += 1;
      if (DEBUG) console.log('检测到一般积极情感表达 +1');
    }
    
    // 消极情感词汇和句型检测
    if (doc.has('(terrible|horrible|awful|worst|garbage|垃圾|烂|废物|差劲|极差)')) {
      sentiment -= 1.5;
      if (DEBUG) console.log('检测到强烈消极情感表达 -1.5');
    } else if (doc.has('(bad|disappointing|poor|worse|不好|一般|差|不满|失望)')) {
      sentiment -= 1;
      if (DEBUG) console.log('检测到一般消极情感表达 -1');
    }
    
    // 特殊的情感标记检查
    const exclamationCount = (text.match(/!|！/g) || []).length;
    if (exclamationCount >= 2) {
      // 多个感叹号通常表示强烈情感
      if (sentiment > 0) {
        sentiment += 0.5;
        if (DEBUG) console.log('检测到多个感叹号，强化积极情感 +0.5');
      } else if (sentiment < 0) {
        sentiment -= 0.5;
        if (DEBUG) console.log('检测到多个感叹号，强化消极情感 -0.5');
      }
    }
    
    // 表情符号检查
    const positiveEmojis = text.match(/[😀😁😊🙂😍👍👏💯🎉🌟✨]/g) || [];
    const negativeEmojis = text.match(/[😠😡😢😭😞👎💔]/g) || [];
    
    sentiment += positiveEmojis.length * 0.3;
    sentiment -= negativeEmojis.length * 0.3;
    
    if (positiveEmojis.length > 0 || negativeEmojis.length > 0) {
      if (DEBUG) console.log(`情感分析：表情符号调整 (${positiveEmojis.length}正，${negativeEmojis.length}负)`);
    }
    
    // 检测疑问句特征
    const questionMarks = (text.match(/\?|？/g) || []).length;
    const hasQuestionKeywords = doc.has('(what|how|when|where|why|who|which|吗|怎么|如何|什么|为什么|哪里)');
    const hasQuestion = questionMarks > 0 || hasQuestionKeywords;
    
    if (hasQuestion) {
      if (DEBUG) console.log(`检测到疑问特征: 问号数量=${questionMarks}, 问句关键词=${hasQuestionKeywords}`);
      
      // 疑问句特征更强时，提高inquiry的权重
      const questionStrength = questionMarks + (hasQuestionKeywords ? 1 : 0);
      
      // 如果权重相近，或没有明确的最佳匹配，优先考虑inquiry
      if (bestMatch.type !== 'inquiry' && 
          (bestMatch.weight < 1 || questionStrength >= 2 ||
           (matches.inquiry && matches.inquiry.weight > bestMatch.weight * 0.6))) {
        bestMatch.type = 'inquiry';
        bestMatch.weight = Math.max(bestMatch.weight, 1.5); // 给予最小权重
        if (DEBUG) console.log('基于强疑问特征设置为咨询场景');
      }
    }
    
    // 检测感谢特征
    const hasGratitude = doc.has('(thank|thanks|appreciate|grateful|thankful|gracias|谢谢|感谢|多谢|非常感谢)');
    if (hasGratitude && (bestMatch.type === 'unknown' || bestMatch.weight < 1.5)) {
      bestMatch.type = 'gratitude';
      bestMatch.weight = Math.max(bestMatch.weight, 1.5);
      if (DEBUG) console.log('检测到明确的感谢表达，设置为感谢场景');
    }
    
    // 如果无法通过关键词匹配确定类型，则使用情感分析结果和句型特征
    if (bestMatch.type === 'unknown' || bestMatch.weight < 0.5) {
      if (sentiment > 1) {
        bestMatch.type = 'compliment';
        bestMatch.weight = Math.max(bestMatch.weight, sentiment);
        if (DEBUG) console.log(`基于强积极情感(${sentiment})设置为赞美场景`);
      } else if (sentiment < -1) {
        bestMatch.type = 'complaint';
        bestMatch.weight = Math.max(bestMatch.weight, Math.abs(sentiment));
        if (DEBUG) console.log(`基于强消极情感(${sentiment})设置为抱怨场景`);
      } else if (hasQuestion) {
        bestMatch.type = 'inquiry';
        bestMatch.weight = Math.max(bestMatch.weight, 1);
        if (DEBUG) console.log('基于疑问特征设置为咨询场景');
      } else if (sentiment > 0) {
        bestMatch.type = 'compliment';
        bestMatch.weight = Math.max(bestMatch.weight, sentiment);
        if (DEBUG) console.log(`基于弱积极情感(${sentiment})设置为赞美场景`);
      } else if (sentiment < 0) {
        bestMatch.type = 'complaint';
        bestMatch.weight = Math.max(bestMatch.weight, Math.abs(sentiment));
        if (DEBUG) console.log(`基于弱消极情感(${sentiment})设置为抱怨场景`);
      }
    }
    
    // 最终结果判断：如果权重较低，改为'other'
    if (bestMatch.weight < 0.5) {
      bestMatch.type = 'other';
    }
    
    // 计算置信度 (0-1)
    const totalWeight = Object.values(matches).reduce((sum, data) => sum + data.weight, 0);
    const confidence = Math.min(totalWeight > 0 ? bestMatch.weight / totalWeight : 0, 1);
    
    // 生成最终结果对象
    const result = {
      type: bestMatch.type,
      confidence: Math.round(confidence * 100) / 100, // 保留2位小数
      sentiment: Math.round(sentiment * 10) / 10, // 保留1位小数
      isQuestion: hasQuestion,
      matchedKeywords: bestMatch.keywords || [],
      textHash: hashText(text) // 添加文本哈希用于区分不同文本
    };
    
    if (DEBUG) console.log('场景检测结果:', result);
    
    return result;
  } catch (error) {
    console.error('场景检测过程出错:', error);
    return { 
      type: 'other',
      confidence: 0, 
      error: error.message
    };
  }
}

/**
 * 简单的文本哈希函数用于区分不同文本
 * @param {string} text 输入文本
 * @returns {string} 哈希值
 */
function hashText(text) {
  if (!text) return '0';
  
  // 更可靠的哈希算法，使用文本的更多特征
  // 包括长度、开头和结尾部分、以及通过字符编码生成的哈希值
  const shortText = text.trim().substring(0, 200);
  let hash = 0;
  
  // 基本hash计算
  for (let i = 0; i < shortText.length; i++) {
    const char = shortText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 转换为32位整数
  }
  
  // 补充一些文本特征提升唯一性
  const lengthHash = text.length % 1000;
  const firstChars = text.substring(0, 5).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
  const lastChars = text.substring(text.length - 5).replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
  
  return `${hash}_${lengthHash}_${firstChars}${lastChars}`;
}

/**
 * 获取场景类型对应的中文描述
 * @param {string} scenarioType 场景类型
 * @returns {string} 场景类型的中文描述
 */
export function getScenarioDescription(scenarioType) {
  const descriptions = {
    compliment: '赞美夸奖',
    complaint: '投诉抱怨',
    inquiry: '咨询提问',
    gratitude: '感谢致谢',
    greeting: '问候打招呼',
    farewell: '告别结束',
    agreement: '同意赞同',
    disagreement: '不同意反对',
    unknown: '未识别类型'
  };
  
  return descriptions[scenarioType] || descriptions.unknown;
}

export default {
  loadScenarios,
  detectScenario,
  getScenarioDescription
}; 