import React, { useState, useRef } from 'react';
import { BookOpen, Copy, Trash2, Search, Edit3, Loader2, FileText, CheckCircle, Mic, Users, LayoutGrid } from 'lucide-react';

/**
 * 💡 환경 변수 안전하게 가져오기
 */
const getApiKey = () => {
  try {
    const env = import.meta.env;
    const key = env ? env.VITE_GEMINI_API_KEY : "AIzaSyAN3dEru7azCmgY4oW6R9RUefjmG0m4XwQ";
    return key ? key.trim() : "";
  } catch (e) {
    return "";
  }
};

const apiKey = getApiKey();

/**
 * 🚀 Gemini API 호출 유틸리티
 * 400 Bad Request를 완벽히 해결하기 위해 가장 표준적인 v1beta 구조를 사용합니다.
 */
const fetchGeminiWithRetry = async (prompt, isJson = false) => {
  if (!apiKey) {
    throw new Error("API 키가 설정되지 않았습니다. Vercel 환경 변수(VITE_GEMINI_API_KEY)를 확인해주세요.");
  }

  // JSON 모드 안정성을 위해 v1beta 엔드포인트를 사용합니다.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  // 프롬프트 구성
  const fullPrompt = isJson 
    ? `${prompt}\n\n결과는 반드시 다른 설명 없이 순수한 JSON 데이터 형식으로만 응답하세요.`
    : `당신은 전문적인 성경 학자이자 목회자입니다. 깊이 있는 신학적 통찰을 바탕으로 한국어로 답변하세요.\n\n요청사항: ${prompt}`;

  // 🚨 400 에러 방지를 위한 표준 페이로드 구조
  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: fullPrompt }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    }
  };

  // JSON 모드가 필요한 경우 스키마 설정 대신 MIME 타입만 지정 (가장 호환성 높음)
  if (isJson) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  const delays = [1000, 2000, 4000, 8000, 16000];
  let lastError = null;

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error("Google API Error Detail:", responseData);
        // 구글 서버가 보내주는 진짜 에러 메시지를 추출합니다.
        const errorMessage = responseData.error?.message || "알 수 없는 오류가 발생했습니다.";
        
        if (response.status === 400) {
          throw new Error(`잘못된 요청(400): ${errorMessage}`);
        }
        if (response.status === 429) {
          throw new Error("사용량 초과(429): 잠시 후 다시 시도해주세요.");
        }
        throw new Error(`API 오류 (${response.status}): ${errorMessage}`);
      }
      
      const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("응답 결과가 비어 있습니다.");
      return text;
      
    } catch (error) {
      lastError = error;
      // 네트워크 에러나 500번대 에러일 때만 재시도
      if (i < 4 && (error.message.includes('50') || error.message.includes('Failed to fetch'))) {
        await new Promise(res => setTimeout(res, delays[i]));
      } else {
        break; // 400번대 에러는 재시도하지 않고 즉시 중단
      }
    }
  }
  
  throw lastError;
};

export default function App() {
  const [book, setBook] = useState('');
  const [chapter, setChapter] = useState('');
  const [startVerse, setStartVerse] = useState('');
  const [endVerse, setEndVerse] = useState('');
  
  const [researchData, setResearchData] = useState(null);
  const [isResearching, setIsResearching] = useState(false);
  
  const [topic, setTopic] = useState('');
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  
  const [outputResult, setOutputResult] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeOutputTask, setActiveOutputTask] = useState('');
  
  const [copiedTop, setCopiedTop] = useState(false);
  const [copiedBottom, setCopiedBottom] = useState(false);

  const section3Ref = useRef(null);

  const handleResearch = async () => {
    if (!book || !chapter || !startVerse || !endVerse) {
      alert("성경 본문을 입력해 주세요.");
      return;
    }

    setIsResearching(true);
    setResearchData(null);
    setSuggestedTopics([]);
    setOutputResult(null);
    
    const prompt = `
      성경 본문: ${book} ${chapter}장 ${startVerse}절 ~ ${endVerse}절
      위 본문을 (1)역사적 배경 (2)문맥과 구조 (3)핵심 단어와 신학 (4)현대적 적용의 순서로 분석하세요.
      반드시 아래 JSON 형식을 지키세요:
      {
        "researchContent": "분석 텍스트 내용",
        "suggestedTopics": ["주제1", "주제2", "주제3"]
      }
    `;

    try {
      const result = await fetchGeminiWithRetry(prompt, true);
      const parsed = JSON.parse(result);
      setResearchData(parsed.researchContent);
      setSuggestedTopics(parsed.suggestedTopics || []);
    } catch (error) {
      alert(`연구 실패: ${error.message}`);
    } finally {
      setIsResearching(false);
    }
  };

  const handleGenerateOutput = async (outputType) => {
    if (!topic) {
      alert("주제를 선택해 주세요.");
      return;
    }

    setIsGenerating(true);
    setActiveOutputTask(outputType);
    setOutputResult(null);

    const prompt = `본문: ${book} ${chapter}:${startVerse}-${endVerse}\n주제: ${topic}\n형식: ${outputType}\n위 내용을 바탕으로 풍성한 사역 자료를 작성하세요.`;

    try {
      const result = await fetchGeminiWithRetry(prompt, false);
      setOutputResult({ type: outputType, content: result });
      setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 300);
    } catch (error) {
      alert(`생성 실패: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setActiveOutputTask('');
    }
  };

  const handleCopy = (pos) => {
    if (!outputResult) return;
    const el = document.createElement('textarea');
    el.value = outputResult.content;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    if (pos === 'top') { setCopiedTop(true); setTimeout(() => setCopiedTop(false), 2000); }
    else { setCopiedBottom(true); setTimeout(() => setCopiedBottom(false), 2000); }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-slate-800 font-sans relative">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] overflow-hidden flex flex-wrap justify-center items-center z-0 text-3xl font-serif select-none">
        {Array(10).fill("בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ ").join('')}
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <header className="flex flex-col items-center mb-12 space-y-2">
          <div className="flex items-center space-x-4">
            <BookOpen className="w-10 h-10 text-amber-700" />
            <h1 className="text-4xl font-black text-amber-900 tracking-tighter uppercase">Lego Bible</h1>
          </div>
          <p className="text-amber-800/60 font-medium italic">성경 연구의 조각들을 연결하여 풍성한 사역으로</p>
        </header>

        <div className="space-y-8">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100">
            <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
              <Search className="w-5 h-5 mr-2" /> 1. 본문 선택
            </h2>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-400 mb-1">성경책</label>
                <input type="text" className="w-full p-3 bg-slate-50 border rounded-xl outline-none" value={book} onChange={e => setBook(e.target.value)} placeholder="예: 로마서"/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">장</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={chapter} onChange={e => setChapter(e.target.value)}/>
              </div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">시작</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={startVerse} onChange={e => setStartVerse(e.target.value)}/>
              </div>
              <div className="pb-4 text-slate-300">~</div>
              <div className="w-20">
                <label className="block text-xs font-bold text-slate-400 mb-1">끝</label>
                <input type="number" className="w-full p-3 bg-slate-50 border rounded-xl" value={endVerse} onChange={e => setEndVerse(e.target.value)}/>
              </div>
              <button onClick={handleResearch} disabled={isResearching} className="px-8 py-3.5 bg-amber-700 text-white rounded-xl font-bold hover:bg-amber-800 transition-all disabled:opacity-50">
                {isResearching ? '연구 중...' : '연구 시작'}
              </button>
            </div>
          </section>

          {researchData && (
            <section className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100 animate-in fade-in slide-in-from-bottom-2">
              <h2 className="text-xl font-bold text-amber-800 mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2" /> 2. 연구 분석
              </h2>
              <div className="prose max-w-none bg-amber-50/30 p-8 rounded-3xl border border-amber-100 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {researchData}
              </div>
              <div className="mt-8 pt-6 border-t border-slate-100">
                <h3 className="text-lg font-bold text-amber-800 mb-3">주제 선택</h3>
                <input type="text" className="w-full p-4 bg-slate-50 border rounded-xl outline-none" value={topic} onChange={e => setTopic(e.target.value)} placeholder="주제를 직접 쓰거나 아래 버튼을 누르세요."/>
                <div className="mt-4 flex flex-wrap gap-2">
                  {suggestedTopics.map((t, i) => (
                    <button key={i} onClick={() => setTopic(t)} className="px-4 py-2 bg-white border border-amber-200 rounded-full text-sm font-semibold text-amber-900 hover:bg-amber-50">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {researchData && (
            <section ref={section3Ref} className="bg-white p-6 rounded-3xl shadow-sm border border-amber-100">
              <h2 className="text-xl font-bold text-amber-800 mb-6">3. 사역 자료 생성</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {['설교문', '성경 공부교재', '비블리오드라마 교재', '공동체 활동 교재'].map((type) => {
                  const isActive = activeOutputTask === type;
                  return (
                    <button key={type} onClick={() => handleGenerateOutput(type)} disabled={!topic || isGenerating} className={`p-6 flex flex-col items-center rounded-2xl border-2 transition-all ${isActive ? 'border-amber-600 bg-amber-50' : 'border-slate-50 hover:border-amber-300'}`}>
                      {isActive ? <Loader2 className="w-8 h-8 mb-2 animate-spin text-amber-600" /> : <Edit3 className="w-8 h-8 mb-2 text-amber-700" />}
                      <span className="font-bold text-sm">{type}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {outputResult && (
            <section className="bg-white rounded-3xl shadow-xl border border-amber-200 overflow-hidden animate-in zoom-in-95">
              <div className="bg-amber-700 px-6 py-4 flex justify-between items-center text-white">
                <h2 className="font-bold">{outputResult.type} 완료</h2>
                <div className="flex gap-2">
                  <button onClick={() => setOutputResult(null)} className="px-3 py-1 bg-amber-800 rounded text-xs">삭제</button>
                  <button onClick={() => handleCopy('top')} className="px-3 py-1 bg-white text-amber-900 rounded text-xs font-bold">{copiedTop ? '복사 완료' : '텍스트 복사'}</button>
                </div>
              </div>
              <div className="p-8 prose max-w-none whitespace-pre-wrap text-slate-800">
                {outputResult.content}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}