import { detectPlatform, getPlatformPrompt } from './platformDetector';

// 模拟window.location
const mockLocation = (hostname) => {
  Object.defineProperty(window, 'location', {
    value: { hostname },
    writable: true
  });
};

describe('平台检测测试', () => {
  // 恢复原始window.location
  const originalLocation = window.location;
  
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true
    });
  });

  test('应该能检测到邮件平台', () => {
    mockLocation('mail.google.com');
    expect(detectPlatform()).toBe('email');
    
    mockLocation('outlook.com');
    expect(detectPlatform()).toBe('email');
    
    mockLocation('mycompany.mail.com');
    expect(detectPlatform()).toBe('email');
  });
  
  test('应该能检测到Twitter平台', () => {
    mockLocation('twitter.com');
    expect(detectPlatform()).toBe('twitter');
    
    mockLocation('x.com');
    expect(detectPlatform()).toBe('twitter');
  });
  
  test('应该能检测到TikTok平台', () => {
    mockLocation('tiktok.com');
    expect(detectPlatform()).toBe('tiktok');
    
    mockLocation('www.tiktok.com');
    expect(detectPlatform()).toBe('tiktok');
  });
  
  test('未知平台应返回other', () => {
    mockLocation('example.com');
    expect(detectPlatform()).toBe('other');
    
    mockLocation('random-website.org');
    expect(detectPlatform()).toBe('other');
  });
});

describe('平台提示文本测试', () => {
  test('应返回正确的平台提示文本', () => {
    expect(getPlatformPrompt('email')).toBe('邮件回复');
    expect(getPlatformPrompt('twitter')).toBe('推特回复');
    expect(getPlatformPrompt('tiktok')).toBe('TikTok评论');
    expect(getPlatformPrompt('other')).toBe('通用回复');
  });
}); 