// BrandCoach Demo Mode - Mock API for standalone preview
// 当后端不可用时，自动切换到演示模式

(function() {
  // BrandCoach Demo Mode - 智能降级
  // 优先使用真实 API；若 API 不可达则自动切换到演示模式（模拟数据）
  // 也可通过 URL 参数 ?demo=1 强制开启演示模式

  const forceDemo = new URLSearchParams(location.search).get('demo') === '1';
  
  // 这些环境默认使用演示模式
  const isDemoHost = location.protocol === 'file:' || 
                     location.host.includes('github.io') ||
                     location.host.includes('pages.dev') ||
                     location.host.includes('vercel') ||
                     location.host.includes('netlify');

  window.__DEMO_MODE__ = { active: false, enabled: false };

  console.log('%c🎯 BrandCoach Demo Mode', 'font-size:14px;font-weight:bold;color:#E76A2C');
  console.log('正在检测 API 可用性...');

  // 检测 API 是否可用
  function checkAPI() {
    return new Promise((resolve) => {
      if (forceDemo || isDemoHost) {
        resolve(false);
        return;
      }
      // 尝试调用健康检查接口，超时 3 秒认为不可达
      const timeout = setTimeout(() => resolve(false), 3000);
      fetch('/health')
        .then(r => r.ok ? resolve(true) : resolve(false))
        .catch(() => resolve(false))
        .finally(() => clearTimeout(timeout));
    });
  }

  // Mock 数据
  const MOCK = {
    scripts: generateMockScripts(),
    characters: generateMockCharacters(),
    profile: {
      role: '海外品牌总监',
      target_market: '北美',
      english_level: 'intermediate',
    },
    wallet: { balance: 9999, plan: 'admin' },
    streak: { current_days: 7, longest_days: 14, total_practice_days: 23, badges: ['7day-warrior'] },
    weekly: { session_count: 5, avg_overall: 7.8, weak_dims: ['grammar', 'cross_cultural'], summary_text: '本周练习5场，语法和跨文化表达需要加强' },
    history: { aggregate: { count: 12, avg_overall: 7.5 }, sessions: [] },
    recommendedToday: {
      items: [
        { script_id: 'S-BD-003', reason: '你的弱项是语法，推荐练习这个剧本提升', weak_dim: 'grammar' },
        { script_id: 'S-DY-007', reason: '跨文化表达是你的薄弱项', weak_dim: 'cross_cultural' },
        { script_id: 'S-MK-001', reason: '适合营销岗位的进阶练习', weak_dim: null },
      ]
    },
    inbox: [],
    srs: {
      today: [
        { script_id: 'S-BD-001', script_title: '客户开发破冰第一句话', scene: 'SC-01', difficulty: 'mid', next_review_date: '2026-09-15', review_stage: 1, last_score: 6.5, last_practice_date: '2026-09-12', total_reviews: 2 },
        { script_id: 'S-DY-003', script_title: '办公室闲聊小对话', scene: 'SC-08', difficulty: 'mid', next_review_date: '2026-09-15', review_stage: 2, last_score: 7.2, last_practice_date: '2026-09-10', total_reviews: 3 },
      ],
      upcoming: [
        { script_id: 'S-DY-001', script_title: '自我介绍与破冰', scene: 'SC-08', difficulty: 'intro', next_review_date: '2026-09-17', review_stage: 0, last_score: 8.0, last_practice_date: '2026-09-14', total_reviews: 1 },
        { script_id: 'S-MK-002', script_title: '品牌故事讲述', scene: 'SC-03', difficulty: 'mid', next_review_date: '2026-09-18', review_stage: 1, last_score: 7.0, last_practice_date: '2026-09-11', total_reviews: 2 },
        { script_id: 'S-BD-005', script_title: '价格谈判与异议处理', scene: 'SC-01', difficulty: 'adv', next_review_date: '2026-09-20', review_stage: 1, last_score: 6.8, last_practice_date: '2026-09-13', total_reviews: 1 },
      ],
      mastered: 3,
      total_learning: 12,
    },
    placementResult: {
      score: 73.3,
      level: 'intermediate',
      level_label: '中级',
      dimension_scores: { grammar: 66.7, vocabulary: 80, business: 73.3, cross_cultural: 66.7, marketing: 80 },
      weak_dimensions: ['grammar', 'cross_cultural'],
      strong_dimensions: ['vocabulary', 'marketing'],
      recommended_path: '中级商务英语提升路径',
      recommended_scripts: ['S-BD-003', 'S-DY-007', 'S-MK-001'],
      total_questions: 15,
      correct_count: 11,
    },
    mistakes: {
      total: 12,
      unreviewed: 5,
      by_type: { grammar: 5, vocabulary: 3, cross_cultural: 2, business_etiquette: 1, pronunciation: 1 },
      by_dimension: { grammar: 5, vocabulary: 3, cross_cultural: 2, business: 2 },
      weak_dimensions: ['grammar', 'vocabulary'],
      mistakes: [
        { id: 'M-0001', sentence: 'I very like this product.', correction: 'I like this product very much.', type: 'grammar', severity: 'minor', script_id: 'S-BD-001', reviewed: false },
        { id: 'M-0002', sentence: 'We need to discuss about the plan.', correction: 'We need to discuss the plan.', type: 'grammar', severity: 'medium', script_id: 'S-BD-002', reviewed: false },
        { id: 'M-0003', sentence: 'I am agree with you.', correction: 'I agree with you.', type: 'grammar', severity: 'minor', script_id: 'S-MK-001', reviewed: false },
        { id: 'M-0004', sentence: 'The price is too expensive.', correction: 'The price is too high.', type: 'vocabulary', severity: 'medium', script_id: 'S-BD-005', reviewed: false },
        { id: 'M-0005', sentence: 'I will give you a feedback.', correction: 'I will give you feedback.', type: 'vocabulary', severity: 'minor', script_id: 'S-BD-003', reviewed: false },
      ]
    }
  };

  function generateMockScripts() {
    const scenes = [
      { id: 'SC-01', title: '客户开发与销售', icon: '🤝', count: 8 },
      { id: 'SC-02', title: '展会与活动', icon: '🎪', count: 3 },
      { id: 'SC-03', title: '营销与品牌', icon: '📢', count: 7 },
      { id: 'SC-04', title: '渠道与合作伙伴', icon: '🤝', count: 6 },
      { id: 'SC-05', title: '公关与媒体', icon: '📰', count: 4 },
      { id: 'SC-06', title: '投资人与融资', icon: '💰', count: 3 },
      { id: 'SC-07', title: '管理与领导力', icon: '👔', count: 4 },
      { id: 'SC-08', title: '商务英语日常', icon: '☕', count: 11 },
    ];
    const scripts = [];
    let idx = 1;
    scenes.forEach(scene => {
      for (let i = 1; i <= scene.count; i++) {
        const diff = i <= Math.floor(scene.count/3) ? 'intro' : i <= Math.floor(scene.count*2/3) ? 'mid' : 'adv';
        scripts.push({
          id: `S-${scene.id.split('-')[1]}-${String(i).padStart(3, '0')}`,
          title: `${scene.title} - 场景 ${i}`,
          scene: scene.id,
          difficulty: diff,
          duration_min: 10 + (i % 3) * 5,
          default_unlock_credits: 0,
          default_session_credits: 0,
          unlocked: true,
        });
        idx++;
      }
    });
    return scripts;
  }

  function generateMockCharacters() {
    return [
      { id: 'mark', name: 'Mark', accent: '美音', persona: '美国营销总监', avatar: '👨‍💼' },
      { id: 'yuki', name: 'Yuki', accent: '日英口音', persona: '日本采购经理', avatar: '👩‍💼' },
      { id: 'james', name: 'James', accent: '英音', persona: '英国投资人', avatar: '🧔' },
      { id: 'sarah', name: 'Sarah', accent: '美音', persona: '美国记者', avatar: '👩‍💻' },
    ];
  }

  // 激活演示模式：覆盖 API 方法
  function activateDemoMode() {
    window.__DEMO_MODE__.active = true;
    
    function tryOverride() {
      if (typeof api === 'undefined') {
        setTimeout(tryOverride, 200);
        return;
      }
      
      console.log('%c✅ 演示模式已激活', 'color:#1B6E4E;font-weight:bold');
      console.log('所有 API 调用将返回模拟数据');

      api.fetchScripts = async () => ({ scripts: MOCK.scripts, total: MOCK.scripts.length });
      api.fetchScript = async (id) => MOCK.scripts.find(s => s.id === id) || MOCK.scripts[0];
      api.fetchCharacters = async () => MOCK.characters;
      api.fetchCharactersFor = async () => MOCK.characters;
      api.fetchProfile = async () => MOCK.profile;
      api.saveProfile = async (data) => { MOCK.profile = { ...MOCK.profile, ...data }; return MOCK.profile; };
      api.fetchWallet = async () => MOCK.wallet;
      api.fetchStreak = async () => MOCK.streak;
      api.fetchWeeklyReport = async () => MOCK.weekly;
      api.fetchHistory = async () => MOCK.history;
      api.fetchInbox = async () => ({ messages: MOCK.inbox, unread_count: 0 });
      api.fetchRecommendedToday = async () => MOCK.recommendedToday;
      api.fetchPhrasebook = async () => ({ phrases: [], total: 0 });
      api.fetchSRSReviews = async () => MOCK.srs;
      api.fetchSRSStats = async () => MOCK.srs;
      api.completeSRSReview = async () => ({ success: true });
      api.fetchGeneratedScripts = async () => ({ scripts: [], total: 0 });
      api.generateScript = async (desc) => {
        await new Promise(r => setTimeout(r, 1500));
        return {
          script_id: 'GEN-0001',
          title: desc.slice(0, 15) + '...',
          scene: 'SC-01',
          difficulty: 'mid',
          duration_min: 15,
          ai_role: 'Senior Marketing Director',
          user_role: '海外品牌总监',
          scenario: desc,
          cultural_traps: ['注意英语商务沟通的直接性', '先讲结论再讲原因', '适当寒暄破冰'],
          learning_objectives: ['掌握核心商务表达', '学习自然对话衔接', '理解跨文化注意事项'],
          ai_first_message: "Hi! Thanks for making the time to talk today. How can I help you?",
          is_generated: true,
        };
      };
      api.fetchPlacementTest = async () => ({
        questions: [
          { id: 'q1', type: 'choice', question: '选择正确的句子："我们公司去年扩张了三个新市场。"', options: ['Our company expanded into three new markets last year.', 'Our company was expanded...', 'Our company has expand...', 'Our company expand...'], correct_index: 0, difficulty: 'intro', dimension: 'grammar' },
          { id: 'q2', type: 'choice', question: "'ROI' 在商务英语中代表什么？", options: ['Return on Investment', 'Rate of Interest', 'Risk of Investment', 'Revenue on Income'], correct_index: 0, difficulty: 'intro', dimension: 'vocabulary' },
          { id: 'q3', type: 'choice', question: '写英文商务邮件时，最标准的开头是？', options: ['I am writing to...', 'I want to tell you that...', 'Hey, I have something...', 'Please read carefully...'], correct_index: 0, difficulty: 'intro', dimension: 'business' },
          { id: 'q4', type: 'choice', question: '和美国客户第一次见面，应该如何称呼对方？', options: ['使用名字 first name', '使用姓氏加先生', '使用职称加姓氏', '等对方先开口'], correct_index: 0, difficulty: 'intro', dimension: 'cross_cultural' },
          { id: 'q5', type: 'choice', question: "'B2B marketing' 中的 B2B 是指？", options: ['Business to Business', 'Back to Basics', 'Buyer to Buyer', 'Brand to Brand'], correct_index: 0, difficulty: 'intro', dimension: 'marketing' },
        ],
        total: 15, estimated_time_min: 5,
      });
      api.submitPlacement = async () => MOCK.placementResult;
      api.fetchMistakes = async () => ({ mistakes: MOCK.mistakes.mistakes, total: MOCK.mistakes.total, types: MOCK.mistakes.by_type });
      api.fetchMistakeStats = async () => MOCK.mistakes;
      api.addMistake = async (data) => ({ id: 'M-9999', ...data, ts: new Date().toISOString() });
      api.markMistakeReviewed = async () => ({ success: true });
      api.fetchWritingPractice = async () => [];
      api.fetchTtsVoices = async () => [];
      api.startSession = async () => ({ session_id: 'demo-session', ai_message: 'Hello! Great to meet you. How can I help today?', ai_role: 'Marketing Director', user_role: 'Brand Manager', scenario: 'Product demo meeting', max_turns: 20, credits_per_turn: 0, credits_remaining: 9999, cultural_traps: [], learning_objectives: [] });
      api.sendTurn = async () => ({ ai_reply: "That's a great point! Let me share more details...", ai_audio: null, user_analysis: { score: 8.0, dimensions: { grammar: 8, vocabulary: 7.5, business: 8.5, cross_cultural: 8 }, suggestions: ['Good use of business vocabulary.'] }, turn: 2, max_turns: 20 });
      api.endSession = async () => ({ overall_score: 8.0, dimensions: { grammar: 8, vocabulary: 7.5, business: 8.5, cross_cultural: 8 }, suggestions: ['Good job!'], key_sentences: [] });
      
      // 显示演示模式提示条
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(90deg,#E76A2C,#F59E0B);color:white;text-align:center;padding:6px 12px;font-size:12px;font-weight:500;z-index:9999;';
      banner.innerHTML = '🎯 演示模式 · 所有数据为模拟数据 · 完整功能需连接后端';
      document.body.insertBefore(banner, document.body.firstChild);
      document.body.style.paddingTop = '32px';
      
      // 更新环境指示器
      const updateEnv = () => {
        const pill = document.getElementById('envPill');
        const label = document.getElementById('envLabel');
        if (pill) pill.setAttribute('data-state', 'mock');
        if (label) label.textContent = '演示模式';
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateEnv);
      } else {
        updateEnv();
      }
    }
    
    tryOverride();
  }

  // 检测 API 并决定是否启用演示模式
  checkAPI().then(apiAvailable => {
    if (apiAvailable) {
      console.log('%c✅ API 可用，使用真实数据', 'color:#1B6E4E;font-weight:bold');
      window.__DEMO_MODE__.enabled = false;
    } else {
      console.log('%c⚠️ API 不可达，启用演示模式', 'color:#B07A1B;font-weight:bold');
      window.__DEMO_MODE__.enabled = true;
      activateDemoMode();
    }
  });
})();
